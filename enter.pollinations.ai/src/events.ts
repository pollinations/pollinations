import { Polar } from "@polar-sh/sdk";
import { eq, sql, and, gte, or, lt, count, min, max } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { event } from "./db/schema/event.ts";
import {
    batches,
    exponentialBackoffDelay,
    generateRandomId,
    removeUnset,
} from "./util.ts";
import {
    InsertGenerationEvent,
    SelectGenerationEvent,
} from "./db/schema/event.ts";
import { omit } from "./util.ts";
import { z } from "zod";
import { Logger } from "@logtape/logtape";

const BUFFER_BATCH_SIZE = 1;
const DEFAULT_MIN_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCH_SIZE = 500;
const MAX_DELIVERY_ATTEMPTS = 5;

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
        minBatchSize?: number;
        maxBatchSize?: number;
        minRetryDelay?: number;
        maxRetryDelay?: number;
    },
) {
    for await (const { processingId, events } of pendingEventBatches(
        db,
        config.minBatchSize ?? DEFAULT_MIN_BATCH_SIZE,
        config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    )) {
        log.trace("Processing event batch with {count} events", {
            count: events.length,
        });
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
            ["succeeded", "skipped"].includes(polarDelivery.status) &&
            ["succeeded", "skipped"].includes(tinybirdDelivery.status)
        ) {
            log.trace("Event processing complete: {processingId}", {
                processingId,
            });
            await confirmProcessingEvents(processingId, db);
        } else {
            log.trace("Event processing failed, rolling back: {processingId}", {
                processingId,
            });
            await rollbackProcessingEvents(processingId, db, {
                polarDelivery,
                tinybirdDelivery,
            });
            if (config.minRetryDelay) {
                const retryDelay = exponentialBackoffDelay(
                    Math.max(
                        polarDelivery.maxDeliveryAttempts,
                        tinybirdDelivery.maxDeliveryAttempts,
                    ),
                    {
                        minDelay: config.minRetryDelay,
                        maxDelay: config.maxRetryDelay,
                        maxAttempts: MAX_DELIVERY_ATTEMPTS,
                    },
                );
                // Wait a bit to prevent rate limiting
                log.trace(
                    "Waiting {retryDelay}ms before retrying: {processingId}",
                    { retryDelay, processingId },
                );
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }
    // Clear successfully sent events
    await clearExpiredEvents(db);
}

type PendingEventsStats = {
    count: number;
    oldestCreatedAt: Date | null;
};

async function checkPendingEvents(
    db: DrizzleD1Database,
): Promise<PendingEventsStats> {
    const result = await db
        .select({ count: count(), oldestCreatedAt: min(event.createdAt) })
        .from(event)
        .where(eq(event.eventStatus, "pending"));
    const stats: PendingEventsStats = result[0];
    if (!stats) {
        throw new Error("Failed to count pending events");
    }
    return stats;
}

async function preparePendingEvents(
    db: DrizzleD1Database,
    minBatchSize: number,
    maxBatchSize: number,
): Promise<{ processingId: string; events: SelectGenerationEvent[] }> {
    const processingId = generateRandomId();

    // Only create a processing batch if there are at least minBatchSize
    // pending events, or if events are older than 30 seconds
    const pendingStats = await checkPendingEvents(db);
    const secondsSinceOldestPendingEvent = Math.floor(
        (Date.now() - (pendingStats.oldestCreatedAt?.getTime() || 0)) / 1000,
    );
    if (
        pendingStats.count < minBatchSize &&
        secondsSinceOldestPendingEvent < 30
    ) {
        return { processingId, events: [] };
    }

    const [_, events] = await db.batch([
        // Update events to processing status
        db
            .update(event)
            .set({
                eventStatus: "processing",
                eventProcessingId: processingId,
                updatedAt: new Date(),
            })
            .where(eq(event.eventStatus, "pending"))
            .limit(maxBatchSize),
        // Fetch updated events (D1 has column limits on .returning())
        db
            .select()
            .from(event)
            .where(eq(event.eventProcessingId, processingId)),
    ]);

    return { processingId, events };
}

async function* pendingEventBatches(
    db: DrizzleD1Database,
    minBatchSize: number,
    maxBatchSize: number,
) {
    while (true) {
        const { processingId, events } = await preparePendingEvents(
            db,
            minBatchSize,
            maxBatchSize,
        );
        if (events.length === 0) break;
        yield { processingId, events };
    }
}

async function rollbackProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
    status: {
        polarDelivery: DeliveryStatus;
        tinybirdDelivery: DeliveryStatus;
    },
): Promise<void> {
    await db.batch([
        // Mark events that exceed MAX_DELIVERY_ATTEMPTS as error
        db
            .update(event)
            .set({ eventStatus: "error" })
            .where(
                and(
                    eq(event.eventProcessingId, processingId),
                    or(
                        gte(event.polarDeliveryAttempts, MAX_DELIVERY_ATTEMPTS),
                        gte(
                            event.tinybirdDeliveryAttempts,
                            MAX_DELIVERY_ATTEMPTS,
                        ),
                    ),
                ),
            ),
        // Mark remaining events as pending
        db
            .update(event)
            .set({
                eventStatus: "pending",
                ...(status.polarDelivery.status === "succeeded" && {
                    polarDeliveredAt: new Date(),
                }),
                ...(status.polarDelivery.status !== "skipped" && {
                    polarDeliveryAttempts: sql`${event.polarDeliveryAttempts} + 1`,
                }),
                ...(status.tinybirdDelivery.status === "succeeded" && {
                    tinybirdDeliveredAt: new Date(),
                }),
                ...(status.tinybirdDelivery.status !== "skipped" && {
                    tinybirdDeliveryAttempts: sql`${event.tinybirdDeliveryAttempts} + 1`,
                }),
            })
            .where(
                and(
                    eq(event.eventProcessingId, processingId),
                    eq(event.eventStatus, "processing"),
                ),
            ),
    ]);
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

async function clearExpiredEvents(db: DrizzleD1Database): Promise<void> {
    // Calculate timestamp for 1 day ago (createdAt is stored as Unix timestamp integer)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db
        .delete(event)
        .where(
            and(eq(event.eventStatus, "sent"), lt(event.createdAt, oneDayAgo)),
        );
}

type DeliveryStatus = {
    status: "skipped" | "failed" | "succeeded";
    minDeliveryAttempts: number;
    maxDeliveryAttempts: number;
};

function createPolarEvent(event: SelectGenerationEvent) {
    if (!event.userId) {
        throw new Error("Failed to create Polar event: missing userId");
    }
    if (!event.modelUsed) {
        throw new Error("Failed to create Polar event: missing modelUsed");
    }
    if (!event.totalPrice) {
        throw new Error("Failed to create Polar event: missing totalPrice");
    }
    const metadata = removeUnset({
        // event
        eventId: event.id,
        eventProcessingId: event.eventProcessingId,
        // request information
        requestId: event.requestId,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        // model
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
        tokenCountCompletionVideoSeconds:
            event.tokenCountCompletionVideoSeconds,
        tokenPriceCompletionVideoSeconds:
            event.tokenPriceCompletionVideoSeconds,
        // calculated price
        totalPrice: event.totalPrice,
        // meter selection
        selectedMeterId: event.selectedMeterId,
        selectedMeterSlug: event.selectedMeterSlug,
        ...flattenBalances(event.balances),
    });
    return {
        name: event.eventType,
        externalId: event.id,
        externalCustomerId: event.userId,
        metadata,
    };
}

export type PolarEvent = ReturnType<typeof createPolarEvent>;

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
    const polarEvents = events
        .filter(
            (event) => event.isBilledUsage && event.polarDeliveredAt == null,
        )
        .map((event) => createPolarEvent(event));
    const deliveryStats = polarDeliveryStats(events);
    if (polarEvents.length === 0)
        return {
            status: "skipped",
            ...deliveryStats,
        };
    
    // Add small delay before delivery to prevent rate limiting
    // This helps mitigate high error rates on event delivery
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    let ingested = 0;
    try {
        const response = await polar.events.ingest({
            events: polarEvents,
        });
        ingested += response.inserted;
    } catch (error) {
        log.error("Failed to send Polar event batch: {error}", {
            error,
        });
    }
    log.debug("Sent events to Polar: {ingested}", { ingested });
    if (ingested !== polarEvents.length) {
        log.error(
            "Number of ingested Polar events did not match: {ingested}/{count}",
            { count: polarEvents.length, ingested },
        );
        return {
            status: "failed",
            ...deliveryStats,
        };
    }
    return {
        status: "succeeded",
        ...deliveryStats,
    };
}

async function sendTinybirdEvents(
    events: SelectGenerationEvent[],
    tinybirdIngestUrl: string,
    tinybirdAccessToken: string,
    log: Logger,
): Promise<DeliveryStatus> {
    const deliveryStats = tinybirdDeliveryStats(events);
    const tinybirdEvents = events
        .filter((event) => event.tinybirdDeliveredAt == null)
        .map((event) => {
            return removeUnset(
                omit(
                    event,
                    "eventStatus",
                    "polarDeliveryAttempts",
                    "polarDeliveredAt",
                    "tinybirdDeliveryAttempts",
                    "tinybirdDeliveredAt",
                    "createdAt",
                    "updatedAt",
                ),
            );
        });
    if (tinybirdEvents.length === 0)
        return {
            status: "skipped",
            ...deliveryStats,
        };
    
    // Add small delay before delivery to prevent rate limiting
    // This helps mitigate high error rates on event delivery
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    let ingested = 0;
    try {
        const response = await fetch(tinybirdIngestUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${tinybirdAccessToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body: tinybirdEvents.map((obj) => JSON.stringify(obj)).join("\n"),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Tinybird API error (status=${response.status}): ${errorText}`,
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
    log.debug("Sent events to Tinybird: {ingested}", { ingested });
    if (ingested !== tinybirdEvents.length) {
        log.error(
            "Number of ingested Tinybird events did not match: {ingested}/{count}",
            { count: tinybirdEvents.length, ingested },
        );
        return {
            status: "failed",
            ...deliveryStats,
        };
    }
    return {
        status: "succeeded",
        ...deliveryStats,
    };
}

function flattenBalances(balances: Record<string, number> | null) {
    if (!balances) return {};
    return Object.fromEntries(
        Object.entries(balances).map(([slug, balance]) => {
            const meterType = slug.split(":").at(-1) || "unknown";
            return [`pollen${capitalize(meterType)}Balance`, balance];
        }),
    );
}

function capitalize(str: string) {
    return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
}

function polarDeliveryStats(events: SelectGenerationEvent[]): {
    minDeliveryAttempts: number;
    maxDeliveryAttempts: number;
} {
    return events.reduce(
        (stats, event) => ({
            minDeliveryAttempts: Math.min(
                event.polarDeliveryAttempts,
                stats.minDeliveryAttempts,
            ),
            maxDeliveryAttempts: Math.max(
                event.polarDeliveryAttempts,
                stats.maxDeliveryAttempts,
            ),
        }),
        { minDeliveryAttempts: MAX_DELIVERY_ATTEMPTS, maxDeliveryAttempts: 0 },
    );
}

function tinybirdDeliveryStats(events: SelectGenerationEvent[]): {
    minDeliveryAttempts: number;
    maxDeliveryAttempts: number;
} {
    return events.reduce(
        (stats, event) => ({
            minDeliveryAttempts: Math.min(
                event.tinybirdDeliveryAttempts,
                stats.minDeliveryAttempts,
            ),
            maxDeliveryAttempts: Math.max(
                event.tinybirdDeliveryAttempts,
                stats.maxDeliveryAttempts,
            ),
        }),
        { minDeliveryAttempts: MAX_DELIVERY_ATTEMPTS, maxDeliveryAttempts: 0 },
    );
}
