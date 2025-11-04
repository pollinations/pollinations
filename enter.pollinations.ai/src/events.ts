import { Polar } from "@polar-sh/sdk";
import { eq, sql, getTableColumns } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { event } from "./db/schema/event.ts";
import { batches, generateRandomId, removeUnset } from "./util.ts";
import {
    InsertGenerationEvent,
    SelectGenerationEvent,
    EventType,
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
        db,
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
    db: DrizzleD1Database,
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
    const skippedEventIds: string[] = []; // Track events skipped due to zero balance
    
    // CRITICAL FIX #3: Fetch balance ONCE and track running totals
    // This prevents race condition where each event sees the same starting balance
    const userBalances = new Map<string, { tier: number; pack: number }>();
    
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
        
        // Get or initialize running balance for this user
        if (!userBalances.has(event.userId)) {
            // Fetch balance ONCE per user in this batch
            let tierBalance = 0;
            let packBalance = 0;
            
            try {
                const customerState = await polar.customers.getStateExternal({
                    externalId: event.userId,
                });
            
                // Extract meters with proper type safety
                const meters = customerState?.activeMeters || [];
                
                // Find TierPollen and PackPollen meters by ID
                const tierMeter = meters.find(m => m.meterId === TIER_POLLEN_METER_ID);
                const packMeters = meters.filter(m => 
                    m.meterId !== TIER_POLLEN_METER_ID && (m.balance || 0) > 0
                );
                
                tierBalance = tierMeter?.balance || 0;
                packBalance = packMeters.reduce((sum, m) => sum + (m.balance || 0), 0);
                
                // Single concise log for balance fetching
                log.info("Balance fetched: userId={userId} cost={cost} tier={tier} pack={pack}", {
                    userId: event.userId,
                    cost,
                    tier: tierBalance,
                    pack: packBalance,
                });
            } catch (error) {
                log.error("❌ CRITICAL: Failed to get customer state for spending router: {error} userId={userId}", {
                    error,
                    userId: event.userId,
                    eventId: event.id,
                });
                // CRITICAL FIX: Don't bill non-existent/errored customers
                // Mark event as error immediately instead of trying to bill with zero balance
                skippedEventIds.push(event.id);
                userBalances.set(event.userId, { tier: 0, pack: 0 }); // Set to zero to trigger skip
                continue; // Skip to next event
            }
            
            // Store initial balance for this user
            userBalances.set(event.userId, { tier: tierBalance, pack: packBalance });
        }
        
        // Get current running balance for this user
        const runningBalance = userBalances.get(event.userId)!;
        const tierBalance = runningBalance.tier;
        const packBalance = runningBalance.pack;
        
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
        
        // CRITICAL FIX #2: Guard against zero balance AND mark event as delivered
        if (tierBalance <= 0 && packBalance <= 0) {
            log.warn("Skipping Polar event - zero balance: userId={userId} cost={cost} eventId={eventId}", {
                userId: event.userId,
                cost,
                eventId: event.id,
            });
            skippedEventIds.push(event.id);
            continue; // Skip this event - will be marked as delivered with error below
        }
        
        // Spending Router Logic - now updates running balance after each event
        if (cost <= tierBalance) {
            // Spend from tier only - use original event name (no prefix) for backward compatibility
            polarEvents.push({
                name: event.eventType, // No prefix for tier events
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "tier",
                    totalPrice: cost,
                },
            });
            
            // Update running balance
            runningBalance.tier -= cost;
            
            // Tier-only route (most common case)
        } else if (tierBalance > 0 && cost <= tierBalance + packBalance) {
            // Split between tier and pack
            const fromTier = tierBalance;
            const fromPack = cost - tierBalance;
            
            // CRITICAL FIX: Add splitGroupId to link the two events
            // This helps analytics and UX understand these are parts of one generation
            const splitGroupId = `${event.id}-split`;
            
            // Tier portion - use original event name (no prefix)
            polarEvents.push({
                name: event.eventType, // No prefix for tier events
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "tier",
                    totalPrice: fromTier,
                    splitGroupId, // Link to other part
                    splitPart: "tier", // Identify this portion
                },
            });
            // Pack portion - add pack. prefix
            polarEvents.push({
                name: `pack.${event.eventType}` as EventType,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType: "pack",
                    totalPrice: fromPack,
                    splitGroupId, // Link to other part
                    splitPart: "pack", // Identify this portion
                },
            });
            
            // Update running balance
            runningBalance.tier = 0;
            runningBalance.pack -= fromPack;
            
            log.info("Split charge: tier={fromTier} pack={fromPack}", { fromTier, fromPack });
        } else {
            // Use pack only (or default to tier if no pack meters found)
            const pollenType = packBalance > 0 ? "pack" : "tier";
            
            // Use pack or tier: only pack gets prefix
            const eventName = pollenType === "pack" 
                ? `pack.${event.eventType}` as EventType
                : event.eventType; // No prefix for tier
            
            polarEvents.push({
                name: eventName,
                externalCustomerId: event.userId,
                metadata: {
                    ...baseMetadata,
                    pollenType,
                    totalPrice: cost,
                },
            });
            
            // Update running balance
            if (pollenType === "pack") {
                runningBalance.pack -= cost;
            } else {
                runningBalance.tier -= cost; // Might go negative (overdraft)
            }
            
            // Pack-only route or overdraft to tier
        }
    }
    
    // CRITICAL FIX #2: Mark zero-balance events as successfully processed (not an error!)
    // These events were correctly handled by business logic - just not billable
    if (skippedEventIds.length > 0) {
        try {
            await db
                .update(event)
                .set({
                    eventStatus: "sent",  // Successfully processed (zero balance is not an error)
                    // polarDeliveredAt stays NULL - nothing was sent to Polar (skipped)
                    updatedAt: new Date(),
                })
                .where(sql`${event.id} IN (${sql.join(skippedEventIds.map(id => sql`${id}`), sql`, `)})`);  
            
            log.info("✅ Marked {count} zero-balance events as processed (skipped billing)", {
                count: skippedEventIds.length,
                eventIds: skippedEventIds,
            });
        } catch (error) {
            log.error("❌ Failed to mark zero-balance events as processed: {error}", { error });
        }
    }
    
    // Send events to Polar
    let ingested = 0;
    for (const batch of batches(polarEvents, INGEST_BATCH_SIZE)) {
        try {
            // Debug: Log the exact events being sent
            log.debug("📤 Sending events to Polar: count={count} events={events}", {
                count: batch.length,
                events: JSON.stringify(batch, null, 2),
            });
            
            const response = await polar.events.ingest({
                events: batch,
            });
            ingested += response.inserted;
            
            log.debug("✅ Polar ingestion response: inserted={inserted} response={response}", {
                inserted: response.inserted,
                response: JSON.stringify(response, null, 2),
            });
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
