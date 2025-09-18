import { processEvents, storeEvents } from "@/polar";
import { ProviderId, REGISTRY, ServiceId } from "@/registry/registry.ts";
import {
    ModelUsage,
    oaiResponseSchema,
    transformOpenAIUsage,
} from "@/usage.ts";
import { generateRandomId } from "@/util.ts";
import { createMiddleware } from "hono/factory";
import type { LoggerVariables } from "./logger.ts";
import { priceToEventParams, usageToEventParams } from "@/db/schema/event.ts";
import { drizzle } from "drizzle-orm/d1";
import { Context } from "hono";
import type { EventType } from "@/db/schema/event.ts";
import type { AuthVariables } from "@/middleware/authenticate.ts";

type TrackVariables = {
    isFreeUsage: boolean;
    modelRequested: string | null;
};

export type TrackEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & TrackVariables;
};

export const track = (eventType: EventType) =>
    createMiddleware<TrackEnv>(async (c, next) => {
        const startTime = new Date();

        const modelRequested = await extractModelRequested(c);
        c.set("modelRequested", modelRequested);

        const defaultService = REGISTRY.defaultService(eventType);
        const serviceOrDefault = (modelRequested ||
            defaultService) as ServiceId;

        const isFreeUsage = REGISTRY.isFreeService(serviceOrDefault);
        c.set("isFreeUsage", isFreeUsage);

        await next();

        if (!c.res.ok) {
            // TODO: store error event
            return;
        }

        const referrerUrl = c.req.header("referer");
        const referrerDomain = referrerUrl && safeUrl(referrerUrl)?.hostname;
        const tokenPrice = REGISTRY.getActivePriceDefinition(serviceOrDefault);
        if (!tokenPrice) {
            throw new Error(
                `Failed to get price definition for model: ${serviceOrDefault}`,
            );
        }
        const modelUsage = await extractUsage(c, eventType);
        const cost = REGISTRY.calculateCost(
            modelUsage.model as ProviderId,
            modelUsage.usage,
        );
        const price = REGISTRY.calculatePrice(
            serviceOrDefault,
            modelUsage.usage,
        );
        const endTime = new Date();

        const event = {
            id: generateRandomId(),
            requestId: c.get("requestId"),
            startTime,
            endTime,
            responseTime: endTime.getTime() - startTime.getTime(),
            responseStatus: c.res.status,
            environment: c.env.ENVIRONMENT,
            eventType,

            userId: c.get("user")?.id,
            userTier: "flower",
            referrerUrl,
            referrerDomain,

            modelRequested,
            modelUsed: modelUsage.model,
            isBilledUsage: !isFreeUsage,

            ...priceToEventParams(tokenPrice),
            ...usageToEventParams(modelUsage.usage),

            totalCost: cost.totalCost,
            totalPrice: price.totalPrice,
        };

        c.executionCtx.waitUntil(
            (async () => {
                const db = drizzle(c.env.DB);
                await storeEvents(db, c.var.log, [event]);
                // process events immediately in development
                if (c.env.ENVIRONMENT === "development")
                    await processEvents(db, c.var.log, {
                        polarAccessToken: c.env.POLAR_ACCESS_TOKEN,
                        tinybirdIngestUrl: c.env.TINYBIRD_INGEST_URL,
                        tinybirdAccessToken: c.env.TINYBIRD_ACCESS_TOKEN,
                    });
            })(),
        );
    });

async function extractModelRequested(
    c: Context<TrackEnv>,
): Promise<string | null> {
    if (c.req.method === "GET") {
        return c.req.query("model") || null;
    }
    if (c.req.method === "POST") {
        const body = await c.req.json();
        return body.model || null;
    }
    return null;
}

async function extractUsage(
    c: Context<TrackEnv>,
    eventType: EventType,
): Promise<ModelUsage> {
    if (eventType === "generate.image") {
        return {
            model: (c.get("modelRequested") || "flux") as ProviderId,
            usage: {
                unit: "TOKENS",
                completionImageTokens: 1,
            },
        };
    } else {
        const parsedResponse = oaiResponseSchema.parse(
            await c.res.clone().json(),
        );
        return {
            model: parsedResponse.model as ProviderId,
            usage: transformOpenAIUsage(parsedResponse.usage),
        };
    }
}

function safeUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}
