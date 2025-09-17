import { processEvents, storeEvents } from "@/polar";
import { ProviderId, REGISTRY, ServiceId } from "@/registry";
import { extractUsage } from "@/usage.ts";
import { generateRandomId } from "@/util.ts";
import { createMiddleware } from "hono/factory";
import type { LoggerVariables } from "./logger.ts";
import { priceToEventParams, usageToEventParams } from "@/db/schema/event.ts";
import { drizzle } from "drizzle-orm/d1";

export type TrackEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        modelRequested?: string;
        modelUsed?: string;
    } & LoggerVariables;
};

export const track = createMiddleware<TrackEnv>(async (c, next) => {
    const startTime = new Date();

    await next();

    const endTime = new Date();

    const referrerUrl = c.req.header("referer");
    const referrerDomain = referrerUrl && new URL(referrerUrl).hostname;

    const modelRequested = c.var.modelRequested;
    if (!modelRequested) {
        throw new Error("Failed to get `modelRequested` from context");
    }

    const response = await c.res.clone().json();
    const tokenPrice = REGISTRY.getActivePriceDefinition(
        modelRequested as ServiceId,
    );
    if (!tokenPrice) {
        throw new Error(
            `Failed to get price definition for model: ${modelRequested}`,
        );
    }
    const isBilledUsage = !REGISTRY.isFreeService(modelRequested as ServiceId);
    const modelUsage = extractUsage(response);
    const cost = REGISTRY.calculateCost(
        modelUsage.model as ProviderId,
        modelUsage.usage,
    );
    const price = REGISTRY.calculatePrice(
        modelRequested as ServiceId,
        modelUsage.usage,
    );
    const event = {
        id: generateRandomId(),
        requestId: c.get("requestId"),
        startTime,
        endTime,
        responseTime: endTime.getTime() - startTime.getTime(),
        responseStatus: c.res.status,
        environment: c.env.ENVIRONMENT,
        eventType: "generate.text" as const,

        userId: "undefined",
        userTier: "flower",
        referrerUrl,
        referrerDomain,

        modelProvider: "undefined",
        modelRequested,
        modelUsed: modelUsage.model,
        isBilledUsage,

        ...priceToEventParams(tokenPrice),
        ...usageToEventParams(modelUsage.usage),

        totalCost: cost.totalCost,
        totalPrice: price.totalPrice,
    };

    c.executionCtx.waitUntil(
        (async () => {
            const db = drizzle(c.env.DB);
            await storeEvents(db, c.var.log, [event]);
            // send to polar directly in development
            if (c.env.ENVIRONMENT === "development")
                await processEvents(db, c.var.log, {
                    polarAccessToken: c.env.POLAR_ACCESS_TOKEN,
                    tinybirdIngestUrl: c.env.TINYBIRD_INGEST_URL,
                    tinybirdUserToken: c.env.TINYBIRD_USER_TOKEN,
                });
        })(),
    );
});
