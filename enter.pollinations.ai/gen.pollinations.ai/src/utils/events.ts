import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../../../src/env";
import * as schema from "../../../src/db/schema/event";

type EventData = {
    eventType: "generate.text" | "generate.image";
    modelRequested: string | null;
    startTime: number;
    endTime: number;
    responseStatus: number;
};

export async function logEvent(c: any, data: EventData) {
    try {
        const db = drizzle(c.env.DB, { schema });

        const event = {
            id: crypto.randomUUID(),
            requestId: c.get("requestId"),
            startTime: new Date(data.startTime),
            endTime: new Date(data.endTime),
            responseTime: data.endTime - data.startTime,
            responseStatus: data.responseStatus,
            environment: c.env.ENVIRONMENT,
            eventType: data.eventType,
            eventStatus: "pending" as const,
            polarDeliveryAttempts: 0,
            tinybirdDeliveryAttempts: 0,
            userId: c.var.user?.id,
            userTier: c.var.userTier,
            modelRequested: data.modelRequested,
            isBilledUsage: false,
            totalCost: 0,
            totalPrice: 0,
            cacheHit: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await db.insert(schema.event).values(event);
    } catch (error) {
        console.error("Failed to log event:", error);
        // Don't throw - logging failures shouldn't break requests
    }
}
