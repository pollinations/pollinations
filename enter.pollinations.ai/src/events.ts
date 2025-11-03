import { Polar } from "@polar-sh/sdk";
import { eq, sql, getTableColumns } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { event } from "./db/schema/event.ts";
import { batches, generateRandomId, removeUnset } from "./util.ts";
import {
    InsertGenerationEvent,
    SelectGenerationEvent,
} from "./db/schema/event.ts";
import { omit } from "./util.ts";
import { z } from "zod";
import { Logger } from "@logtape/logtape";
import { TIER_POLLEN_METER_ID } from "./client/config.ts";

const BUFFER_BATCH_SIZE = 1;
const INGEST_BATCH_SIZE = 1000;

const tbIngestResponseSchema = z.object({
    successful_rows: z.number(),
    quarantined_rows: z.number(),
});

export async function storeEvents(
    db: DrizzleD1Database,
    log: Logger,
    events: InsertGenerationEvent[],
) {
    log.trace("Storing events: {count}", { count: events.length });
    for (const batch of batches(events, BUFFER_BATCH_SIZE)) {
        try {
            await db.insert(event).values(batch).onConflictDoNothing();
        } catch (e) {
            log.error("Failed to insert event batch: {e}", { e });
        }
    }
}

export async function processEvents(
    db: DrizzleD1Database,
    log: Logger,
    config: {
        polarAccessToken: string;
        polarServer: "sandbox" | "production";
        tinybirdIngestUrl: string;
        tinybirdAccessToken: string;
    },
) {
    const [processingId, events] = await preparePendingEvents(db);
    if (events.length === 0) return;
    const polarDelivery = await sendPolarEvents(
        events,
        config.polarAccessToken,
        config.polarServer,
        log,
    );
    const tinybirdDelivery = await sendTinybirdEvents(
        events,
        config.tinybirdIngestUrl,
        config.tinybirdAccessToken,
        log,
    );
    if (
        ["succeeded", "skipped"].includes(polarDelivery) &&
        ["succeeded", "skipped"].includes(tinybirdDelivery)
    ) {
        log.trace("Event processing complete.");
        await confirmProcessingEvents(processingId, db);
    } else {
        log.trace("Event processing failed, rolling back.");
        await rollbackProcessingEvents(processingId, db, {
            polarDelivery,
            tinybirdDelivery,
        });
    }
}

async function preparePendingEvents(
    db: DrizzleD1Database,
): Promise<[string, SelectGenerationEvent[]]> {
    const eventProcessingId = generateRandomId();

    // Update events to processing status
    await db
        .update(event)
        .set({ eventStatus: "processing", eventProcessingId, updatedAt: new Date() })
        .where(eq(event.eventStatus, "pending"));

    // Fetch the updated events (D1 has column limits on .returning())
    const pending = await db
        .select()
        .from(event)
        .where(eq(event.eventProcessingId, eventProcessingId));

    if (pending.length === 0) return [eventProcessingId, []];
    return [eventProcessingId, pending];
}

async function rollbackProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
    status: {
        polarDelivery: DeliveryStatus;
        tinybirdDelivery: DeliveryStatus;
    },
): Promise<void> {
    await db
        .update(event)
        .set({
            eventStatus: "pending",
            ...(status.polarDelivery === "succeeded" && {
                polarDeliveredAt: new Date(),
            }),
            ...(status.polarDelivery !== "skipped" && {
                polarDeliveryAttempts: sql`${event.polarDeliveryAttempts} + 1`,
            }),
            ...(status.tinybirdDelivery === "succeeded" && {
                tinybirdDeliveredAt: new Date(),
            }),
            ...(status.tinybirdDelivery !== "skipped" && {
                tinybirdDeliveryAttempts: sql`${event.tinybirdDeliveryAttempts} + 1`,
            }),
        })
        .where(eq(event.eventProcessingId, processingId));
}

async function confirmProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
): Promise<void> {
    await db
        .update(event)
        .set({
            eventStatus: "sent",
        })
        .where(eq(event.eventProcessingId, processingId));
}

type DeliveryStatus = "skipped" | "failed" | "succeeded";

async function sendPolarEvents(
    events: SelectGenerationEvent[],
    polarAccessToken: string,
    polarServer: "sandbox" | "production",
    log: Logger,
): Promise<DeliveryStatus> {
    const polar = new Polar({
        accessToken: polarAccessToken,
        server: polarServer,
    });
    
    // Filter events that need to be sent
    const billedEvents = events.filter(
        (event) => event.isBilledUsage && event.polarDeliveredAt == null,
    );
    
    if (billedEvents.length === 0) return "skipped";
    
    // Process events with spending router
    const polarEvents = [];
    
    for (const event of billedEvents) {
        if (!event.userId) {
            throw new Error("Failed to create Polar event: missing userId");
        }
        if (!event.modelUsed) {
            throw new Error("Failed to create Polar event: missing modelUsed");
        }
        if (!event.totalPrice) {
            throw new Error("Failed to create Polar event: missing totalPrice");
        }
        
        const cost = event.totalPrice;
        
        // Get customer state to determine meter balances
        let tierBalance = 0;
        let packBalance = 0;
        
        try {
            const customerState = await polar.customers.getStateExternal({
                externalId: event.userId,
            });
            
            // Log FULL RAW customer state for debugging
            log.debug("RAW Polar API response: {raw}", {
                raw: JSON.stringify(customerState, null, 2)
            });
            
            // Log full customer state for debugging with meter details
            const meters = (customerState as any).activeMeters || [];
            log.debug("All meters: {meters}", {
                meters: meters.map((m: any) => ({
                    meterId: m.meterId,
                    balance: m.balance,
                    credited: m.creditedUnits,
                    consumed: m.consumedUnits
                }))
            });
            
            // Find TierPollen and PackPollen meters by ID
            // TierPollen is the subscription meter, PackPollen is from pack purchases
            const tierMeter = meters.find((m: any) => 
                m.meterId === TIER_POLLEN_METER_ID
            );
            const packMeters = meters.filter((m: any) => 
                m.meterId !== TIER_POLLEN_METER_ID && m.balance > 0
            );
            
            tierBalance = tierMeter?.balance || 0;
            packBalance = packMeters.reduce((sum: number, m: any) => sum + (m.balance || 0), 0);
            
            log.debug("Meter identification: tierMeter={tierId} packMeters={packIds}", {
                tierId: TIER_POLLEN_METER_ID,
                packIds: packMeters.map((m: any) => m.meterId)
            });
            
            log.info("Spending router balances fetched: userId={userId} cost={cost} tier={tier} pack={pack}", {
                userId: event.userId,
                cost,
                tier: tierBalance,
                pack: packBalance,
            });
        } catch (error) {
            log.warn("Failed to get customer state for spending router: {error}, defaulting to tier", {
                error,
                userId: event.userId,
            });
        }
        
        // Create base metadata (without pollenType)
        const baseMetadata = removeUnset({
            model: event.modelUsed,
            // token counts
            tokenCountPromptText: event.tokenCountPromptText,
            tokenCountPromptAudio: event.tokenCountPromptAudio,
            tokenCountPromptCached: event.tokenCountPromptCached,
            tokenCountPromptImage: event.tokenCountPromptImage,
            tokenCountCompletionText: event.tokenCountCompletionText,
            tokenCountCompletionReasoning: event.tokenCountCompletionReasoning,
            // token prices
            tokenPricePromptText: event.tokenPricePromptText,
            tokenPricePromptCached: event.tokenPricePromptCached,
            tokenPricePromptAudio: event.tokenPricePromptAudio,
            tokenPricePromptImage: event.tokenPricePromptImage,
            tokenPriceCompletionText: event.tokenPriceCompletionText,
            tokenPriceCompletionReasoning: event.tokenPriceCompletionReasoning,
            tokenPriceCompletionAudio: event.tokenPriceCompletionAudio,
            tokenPriceCompletionImage: event.tokenPriceCompletionImage,
        });
        
        // CRITICAL: Guard against zero balance - don't send events if both meters are empty
        if (tierBalance <= 0 && packBalance <= 0) {
            log.warn("Skipping Polar event - zero balance: userId={userId} cost={cost}", {
                userId: event.userId,
                cost,
            });
            continue; // Skip this event
        }
        
        // Spending Router Logic
        if (cost <= tierBalance) {
            // Spend from tier only
            polarEvents.push({
                name: event.eventType,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "tier",
                    totalPrice: cost,
                },
            });
            log.info("Router decision: TIER ONLY - cost={cost} tier={tier} pack={pack}", {
                cost,
                tier: tierBalance,
                pack: packBalance,
            });
        } else if (tierBalance > 0 && cost <= tierBalance + packBalance) {
            // Split between tier and pack
            const fromTier = tierBalance;
            const fromPack = cost - tierBalance;
            
            polarEvents.push({
                name: event.eventType,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "tier",
                    totalPrice: fromTier,
                },
            });
            polarEvents.push({
                name: event.eventType,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "pack",
                    totalPrice: fromPack,
                },
            });
            log.info("Router decision: SPLIT - fromTier={fromTier} fromPack={fromPack} total={cost}", {
                fromTier,
                fromPack,
                cost,
            });
        } else {
            // Use pack only (or default to tier if no pack meters found)
            const pollenType = packBalance > 0 ? "pack" : "tier";
            
            polarEvents.push({
                name: event.eventType,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType,
                    totalPrice: cost,
                },
            });
            log.info("Router decision: PACK ONLY - cost={cost} tier={tier} pack={pack} pollenType={pollenType}", {
                cost,
                tier: tierBalance,
                pack: packBalance,
                pollenType,
            });
        }
    }
    
    // Send events to Polar
    let ingested = 0;
    for (const batch of batches(polarEvents, INGEST_BATCH_SIZE)) {
        try {
            const response = await polar.events.ingest({
                events: batch,
            });
            ingested += response.inserted;
        } catch (error) {
            log.error("Failed to send Polar event batch: {error}", {
                error,
            });
        }
    }
    log.debug("Sent events to Polar: {ingested}", { ingested });
    if (ingested !== polarEvents.length) {
        log.error(
            "Number of ingested Polar events did not match: {ingested}/{count}",
            { count: polarEvents.length, ingested },
        );
        return "failed";
    }
    return "succeeded";
}

async function sendTinybirdEvents(
    events: SelectGenerationEvent[],
    tinybirdIngestUrl: string,
    tinybirdAccessToken: string,
    log: Logger,
): Promise<DeliveryStatus> {
    const tinybirdEvents = events
        .filter((event) => event.tinybirdDeliveredAt == null)
        .map((event) => {
            return removeUnset(
                omit(
                    event,
                    "id",
                    "eventStatus",
                    "eventProcessingId",
                    "polarDeliveryAttempts",
                    "polarDeliveredAt",
                    "tinybirdDeliveryAttempts",
                    "tinybirdDeliveredAt",
                    "createdAt",
                    "updatedAt",
                ),
            );
        });
    if (tinybirdEvents.length === 0) return "skipped";
    let ingested = 0;
    for (const batch of batches(tinybirdEvents, INGEST_BATCH_SIZE)) {
        try {
            const response = await fetch(tinybirdIngestUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${tinybirdAccessToken}`,
                    "Content-Type": "application/x-ndjson",
                },
                body: batch.map((obj) => JSON.stringify(obj)).join("\n"),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Tinybird API error: ${response.status} - ${errorText}`,
                );
            }
            const body = await response.json();
            const result = tbIngestResponseSchema.parse(body);
            ingested += result.successful_rows;
        } catch (error) {
            log.error("Failed to send Tinybird event batch: {error}", {
                error,
            });
        }
    }
    log.debug("Sent events to Tinybird: {ingested}", { ingested });
    if (ingested !== tinybirdEvents.length) {
        log.error(
            "Number of ingested Tinybird events did not match: {ingested}/{count}",
            { count: tinybirdEvents.length, ingested },
        );
        return "failed";
    }
    return "succeeded";
}
