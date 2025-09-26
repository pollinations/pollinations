import { processEvents, storeEvents } from "@/events.ts";
import { ProviderId, REGISTRY, ServiceId } from "@/registry/registry.ts";
import {
    ModelUsage,
    OpenAIResponse,
    openaiResponseSchema,
    transformOpenAIUsage,
} from "@/usage.ts";
import { generateRandomId } from "@/util.ts";
import { createMiddleware } from "hono/factory";
import type { LoggerVariables } from "./logger.ts";
import {
    contentFilterResultsToEventParams,
    priceToEventParams,
    usageToEventParams,
} from "@/db/schema/event.ts";
import { drizzle } from "drizzle-orm/d1";
import { Context } from "hono";
import type {
    EventType,
    GenerationEventContentFilterParams,
} from "@/db/schema/event.ts";
import type { AuthVariables } from "@/middleware/authenticate.ts";
import { PolarVariables } from "./polar.ts";
import { z } from "zod";

export type TrackVariables = {
    track: {
        isFreeUsage: boolean;
        modelRequested: string | null;
    };
};

export type TrackEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables &
        AuthVariables &
        PolarVariables &
        TrackVariables;
};

export const track = (eventType: EventType) =>
    createMiddleware<TrackEnv>(async (c, next) => {
        const log = c.get("log");
        const startTime = new Date();

        const modelRequested = await extractModelRequested(c);
        const serviceOrDefault = REGISTRY.withFallbackService(
            modelRequested,
            eventType,
        );
        const isFreeUsage = REGISTRY.isFreeService(serviceOrDefault);

        c.set("track", {
            modelRequested,
            isFreeUsage,
        });

        await next();

        const referrerInfo = extractReferrerInfo(c);
        const cacheInfo = extractCacheInfo(c);
        const tokenPrice = REGISTRY.getActivePriceDefinition(serviceOrDefault);
        if (!tokenPrice) {
            throw new Error(
                `Failed to get price definition for model: ${serviceOrDefault}`,
            );
        }
        let openaiResponse, modelUsage, costType, cost, price;
        if (c.res.ok) {
            if (eventType === "generate.text") {
                const body = await c.res.clone().json();
                openaiResponse = openaiResponseSchema.parse(body);
            }
            if (!cacheInfo.cacheHit) {
                modelUsage = extractUsage(
                    eventType,
                    modelRequested,
                    openaiResponse,
                );
                costType = REGISTRY.getCostType(modelUsage.model as ProviderId);
                cost = REGISTRY.calculateCost(
                    modelUsage.model as ProviderId,
                    modelUsage.usage,
                );
                price = REGISTRY.calculatePrice(
                    serviceOrDefault as ServiceId,
                    modelUsage.usage,
                );
            } else {
                log.info(
                    "Response was served from {cacheType} cache, skipping cost/price calculation",
                    { ...cacheInfo, cacheType: cacheInfo.cacheType || "exact" },
                );
            }
        } else {
            // TODO: track error events
            log.info("Response was not ok ({status}), skipping tracking", {
                status: c.res.status,
            });
            return;
        }
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

            userId: c.var.auth.user?.id,
            userTier: extractUserTier(eventType, openaiResponse),
            ...referrerInfo,

            modelRequested,
            modelUsed: modelUsage?.model,
            isBilledUsage: !isFreeUsage && !cacheInfo.cacheHit,

            ...priceToEventParams(tokenPrice),
            ...usageToEventParams(modelUsage?.usage),
            ...extractContentFilterResults(eventType, openaiResponse),

            costType,
            totalCost: cost?.totalCost || 0,
            totalPrice: price?.totalPrice || 0,

            ...cacheInfo,
        };

        log.trace("Event: {event}", { event });

        c.executionCtx.waitUntil(
            (async () => {
                const db = drizzle(c.env.DB);
                await storeEvents(db, c.var.log, [event]);
                // process events immediately in development
                if (c.env.ENVIRONMENT === "development")
                    await processEvents(db, c.var.log, {
                        polarAccessToken: c.env.POLAR_ACCESS_TOKEN,
                        polarServer: c.env.POLAR_SERVER,
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

function extractUsage(
    eventType: EventType,
    modelRequested: string | null,
    response?: OpenAIResponse,
): ModelUsage {
    if (eventType === "generate.image") {
        return {
            // TODO: use x-model-used header once implemented in image service
            model: (modelRequested || "flux") as ProviderId,
            usage: {
                unit: "TOKENS",
                completionImageTokens: 1,
            },
        };
    }
    if (response) {
        return {
            model: response?.model as ProviderId,
            usage: transformOpenAIUsage(response.usage),
        };
    }
    throw new Error(
        "Failed to extract usage: generate.text event without valid response object",
    );
}

function extractUserTier(
    eventType: EventType,
    response?: OpenAIResponse,
): string | undefined {
    if (eventType === "generate.text") {
        return response?.user_tier;
    }
    // TODO: use x-user-tier header for image generations once implemented
    return undefined;
}

function extractContentFilterResults(
    eventType: EventType,
    response?: OpenAIResponse,
): GenerationEventContentFilterParams {
    if (eventType === "generate.text" && response) {
        return contentFilterResultsToEventParams(response);
    }
    // TODO: use x-moderation headers for image generations once implemented
    return {};
}

type CacheInfo = {
    cacheHit: boolean;
    cacheKey?: string;
    cacheType?: "exact" | "semantic";
    cacheSemanticSimilarity?: number;
    cacheSemanticThreshold?: number;
};

function extractCacheInfo(c: Context<TrackEnv>): CacheInfo {
    return {
        cacheHit: c.res.headers.get("x-cache") === "HIT",
        cacheKey: c.res.headers.get("x-cache-key") || undefined,
        cacheType: z
            .enum(["exact", "semantic"])
            .safeParse(c.res.headers.get("x-cache-type")).data,
        cacheSemanticSimilarity: z
            .number()
            .safeParse(c.res.headers.get("x-cache-semantic-similarity")).data,
        cacheSemanticThreshold: z
            .number()
            .safeParse(c.res.headers.get("x-cache-semantic-threshold")).data,
    };
}

type ReferrerInfo = {
    referrerUrl?: string;
    referrerDomain?: string;
};

function extractReferrerInfo(c: Context<TrackEnv>): ReferrerInfo {
    const referrerUrl = c.req.header("referer");
    const referrerDomain = referrerUrl && safeUrl(referrerUrl)?.hostname;
    return { referrerUrl, referrerDomain };
}

function safeUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}
