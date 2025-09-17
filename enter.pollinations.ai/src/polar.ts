import { Polar } from "@polar-sh/sdk";
import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import { event } from "./db/schema/event.ts";
import { batches, generateRandomId } from "./util.ts";
import {
    InsertGenerationEvent,
    SelectGenerationEvent,
} from "./db/schema/event.ts";
import { omit } from "./util.ts";
import { z } from "zod";
import { Logger } from "@logtape/logtape";

const tbIngestResponseSchema = z.object({
    successful_rows: z.number(),
    quarantined_rows: z.number(),
});

const INSERT_BATCH_SIZE = 1;
const POLAR_BATCH_SIZE = 1000;

export async function storeEvents(
    db: DrizzleD1Database,
    log: Logger,
    events: InsertGenerationEvent[],
) {
    for (const batch of batches(events, INSERT_BATCH_SIZE)) {
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
        tinybirdIngestUrl: string;
        tinybirdUserToken: string;
    },
) {
    const [processingId, events] = await preparePendingEvents(db);
    if (events.length === 0) return;
    let attemptedPolarDelivery = false;
    let attemptedTinybirdDelivery = false;
    try {
        if (events.some((event) => event.polarDeliveredAt == null)) {
            attemptedPolarDelivery = true;
            const numIngestedPolar = await sendPolarEvents(
                events,
                config.polarAccessToken,
                log,
            );
            if (numIngestedPolar !== events.length) {
                throw new Error(
                    "Number of ingested Polar events did not match",
                );
            }
        }

        if (events.some((event) => event.tinybirdDeliveredAt == null)) {
            attemptedTinybirdDelivery = true;
            const numIngestedTinybird = await sendTinybirdEvents(
                events,
                config.tinybirdIngestUrl,
                config.tinybirdUserToken,
                log,
            );
            if (numIngestedTinybird !== events.length) {
                throw new Error(
                    "Number of ingested Tinybird events did not match",
                );
            }
        }

        await confirmProcessingEvents(processingId, db);
    } catch (e) {
        log.error("Failed to process events: {error}", { error: e });
        await rollbackProcessingEvents(processingId, db, {
            attemptedPolarDelivery,
            attemptedTinybirdDelivery,
        });
    }
}

async function preparePendingEvents(
    db: DrizzleD1Database,
): Promise<[string, SelectGenerationEvent[]]> {
    const eventProcessingId = generateRandomId();

    const pending = await db
        .update(event)
        .set({ eventStatus: "processing", eventProcessingId })
        .where(eq(event.eventStatus, "pending"))
        .returning();

    if (pending.length === 0) return [eventProcessingId, []];
    return [eventProcessingId, pending];
}

async function rollbackProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
    status: {
        attemptedPolarDelivery: boolean;
        attemptedTinybirdDelivery: boolean;
    },
): Promise<void> {
    await db
        .update(event)
        .set({
            eventStatus: "pending",
            ...(status.attemptedPolarDelivery && {
                polarDeliveryAttempts: sql`${event.polarDeliveryAttempts} + 1`,
            }),
            ...(status.attemptedTinybirdDelivery && {
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

async function sendPolarEvents(
    events: SelectGenerationEvent[],
    polarAccessToken: string,
    log: Logger,
): Promise<number> {
    log.debug("Sending {count} events to Polar", { count: events.length });
    const polar = new Polar({
        accessToken: polarAccessToken,
        server: "sandbox",
    });
    const polarEvents = events.map((event) => {
        const metadata = {
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
            // calculated price
            totalPrice: event.totalPrice,
        };
        return {
            name: event.eventType,
            externalCustomerId: event.userId,
            metadata,
        };
    });
    let inserted = 0;
    for (const batch of batches(polarEvents, POLAR_BATCH_SIZE)) {
        const response = await polar.events.ingest({
            events: batch,
        });
        inserted += response.inserted;
    }
    log.debug("Ingested {inserted} events", { inserted });
    return inserted;
}

async function sendTinybirdEvents(
    events: SelectGenerationEvent[],
    tinybirdIngestUrl: string,
    tinybirdUserToken: string,
    log: Logger,
): Promise<number> {
    const tinybirdEvents = events.map((event) => {
        return omit(
            event,
            "eventStatus",
            "polarDeliveryAttempts",
            "polarDeliveredAt",
            "tinybirdDeliveryAttempts",
            "tinybirdDeliveredAt",
            "createdAt",
            "updatedAt",
        );
    });

    try {
        log.debug("Tinybird Ingest URL: {tinybirdIngestUrl}", {
            tinybirdIngestUrl,
        });
        log.debug("Tinybird User Token: {tinybirdUserToken}", {
            tinybirdUserToken,
        });
        const response = await fetch(tinybirdIngestUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${tinybirdUserToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(tinybirdEvents),
        });
        const body = await response.text();
        console.log("BODY:", body);
        const result = tbIngestResponseSchema.parse(body);
        return result.successful_rows;
    } catch (e) {
        log.error("Failed to send Tinybird events: {error}", { error: e });
        return 0;
    }
}
