import { processEvents, storeEvents } from "@/events.ts";
import { ProviderId, REGISTRY, ServiceId } from "@shared/registry/registry.ts";
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
        const resolvedModelRequested = REGISTRY.resolveServiceId(
            modelRequested,
            eventType,
        );
        const isFreeUsage = REGISTRY.isFreeService(resolvedModelRequested);

        c.set("track", {
            modelRequested,
            isFreeUsage,
        });

        await next();

        const referrerInfo = extractReferrerInfo(c);
        const cacheInfo = extractCacheInfo(c);
        const tokenPrice = REGISTRY.getActivePriceDefinition(
            resolvedModelRequested,
        );
        if (!tokenPrice) {
            throw new Error(
                `Failed to get price definition for model: ${resolvedModelRequested}`,
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
                    c,
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
                    resolvedModelRequested as ServiceId,
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
            userTier: extractUserTier(c, openaiResponse),
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
    c: Context<TrackEnv>,
    eventType: EventType,
    modelRequested: string | null,
    response?: OpenAIResponse,
): ModelUsage {
    if (eventType === "generate.image") {
        // Read actual token count from x-completion-image-tokens header
        const tokenCountHeader = c.res.headers.get("x-completion-image-tokens");
        const completionImageTokens = tokenCountHeader 
            ? parseInt(tokenCountHeader, 10) 
            : 1;
        
        // Read actual model used from x-model-used header
        const modelUsedHeader = c.res.headers.get("x-model-used");
        const model = (modelUsedHeader || modelRequested || "flux") as ProviderId;
        
        return {
            model,
            usage: {
                unit: "TOKENS",
                completionImageTokens,
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
    c: Context<TrackEnv>,
    response?: OpenAIResponse,
): string | undefined {
    // Try header first (works for both image and text generations)
    const headerTier = c.res.headers.get("x-user-tier");
    if (headerTier) {
        return headerTier;
    }
    
    // Fall back to response object for text generations
    return response?.user_tier;
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
