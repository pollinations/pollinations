import { Polar } from "@polar-sh/sdk";
import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import type { InsertPolarEvent, PolarEvent } from "./db/schema/event.ts";
import { event } from "./db/schema/event.ts";
import { batches } from "./util.ts";

const INSERT_BATCH_SIZE = 10;
const POLAR_BATCH_SIZE = 1000;

export async function storePolarEvents(
    events: InsertPolarEvent[],
    env: Cloudflare.Env,
) {
    const db = drizzle(env.DB);
    for (const batch of batches(events, INSERT_BATCH_SIZE)) {
        try {
            await db.insert(event).values(batch).onConflictDoNothing();
        } catch (e) {
            console.error("Failed to insert event batch:", e);
        }
    }
}

export async function processPolarEvents(env: Cloudflare.Env) {
    const db = drizzle(env.DB);
    const [processingId, events] = await preparePendingEvents(db);
    if (events.length === 0) return;
    try {
        const inserted = await sendToPolar(events, env);
        if (inserted !== events.length) {
            throw new Error("Number of inserted events did not match");
        }
        await confirmProcessingEvents(processingId, db);
    } catch (e) {
        await rollbackProcessingEvents(processingId, db);
        console.error(e);
    }
}

async function preparePendingEvents(
    db: DrizzleD1Database,
): Promise<[string, PolarEvent[]]> {
    const processingId = crypto.randomUUID();

    const pending = await db
        .update(event)
        .set({ status: "processing", processingId })
        .where(eq(event.status, "pending"))
        .returning();

    if (pending.length === 0) return [processingId, []];
    return [processingId, pending];
}

async function rollbackProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
): Promise<void> {
    await db
        .update(event)
        .set({
            status: "pending",
            deliveryAttempts: sql`${event.deliveryAttempts} + 1`,
        })
        .where(eq(event.processingId, processingId));
}

async function confirmProcessingEvents(
    processingId: string,
    db: DrizzleD1Database,
): Promise<void> {
    await db
        .update(event)
        .set({
            status: "sent",
        })
        .where(eq(event.processingId, processingId));
}

async function sendToPolar(
    events: PolarEvent[],
    env: Cloudflare.Env,
): Promise<number> {
    console.log(`Sending ${events.length} events to Polar`);
    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: "sandbox",
    });
    const polarEvents = events.map((event) => {
        const { name, userId, metadata } = event;
        return {
            name,
            externalCustomerId: userId,
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
    console.log(`Ingested ${inserted} events`);
    return inserted;
}
