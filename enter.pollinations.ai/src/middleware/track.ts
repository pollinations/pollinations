import { processEvents, storeEvents } from "@/events.ts";
import {
    resolveServiceId,
    isFreeService,
    getActivePriceDefinition,
    calculateCost,
    calculatePrice,
    ServiceId,
    ModelId,
} from "@shared/registry/registry.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";
import {
    ContentFilterSeveritySchema,
    CreateChatCompletionResponseSchema,
    type CreateChatCompletionResponse,
} from "@/schemas/openai.ts";
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
import type { AuthVariables } from "@/middleware/auth.ts";
import { PolarVariables } from "./polar.ts";
import { z } from "zod";
import { TokenUsage } from "../../../shared/registry/registry.js";
import { removeUnset } from "@/util.ts";

export type ModelUsage = {
    model: ModelId;
    usage: TokenUsage;
};

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
        const resolvedModelRequested = resolveServiceId(
            modelRequested,
            eventType,
        );
        const isFreeUsage = isFreeService(resolvedModelRequested);

        c.set("track", {
            modelRequested,
            isFreeUsage,
        });

        await next();

        const referrerInfo = extractReferrerInfo(c);
        const cacheInfo = extractCacheHeaders(c);
        const tokenPrice = getActivePriceDefinition(resolvedModelRequested);
        if (!tokenPrice) {
            throw new Error(
                `Failed to get price definition for model: ${resolvedModelRequested}`,
            );
        }
        let modelUsage, cost, price;
        if (c.res.ok) {
            if (!cacheInfo.cacheHit) {
                modelUsage = extractUsage(c);
                validateUsage(modelUsage, isFreeUsage);

                log.debug("[COST] Model usage extracted: {modelUsage}", {
                    modelUsage,
                });

                cost = calculateCost(
                    modelUsage.model as ModelId,
                    modelUsage.usage,
                );

                price = calculatePrice(
                    resolvedModelRequested as ServiceId,
                    modelUsage.usage,
                );

                log.debug("[COST] Calculated cost: {cost}, price: {price}", {
                    cost,
                    price,
                });
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
            userTier: extractUserTier(c),
            ...referrerInfo,

            modelRequested,
            modelUsed: modelUsage?.model,
            isBilledUsage: !isFreeUsage && !cacheInfo.cacheHit,

            ...priceToEventParams(tokenPrice),
            ...usageToEventParams(modelUsage?.usage),
            ...extractContentFilterResults(c.res.headers),

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

function extractUsage(c: Context<TrackEnv>): ModelUsage {
    const log = c.get("log");
    const usage = parseUsageHeaders(c.res.headers);
    const modelUsed = c.res.headers.get("x-model-used");
    if (!modelUsed) {
        throw new Error(
            "Failed to determine model: x-model-used header was missing",
        );
    }
    log.debug("[COST] Extracted headers: model: {model}, usage: {usage}", {
        model: modelUsed,
        usage,
    });
    return {
        model: modelUsed as ModelId,
        usage,
    };
}

function validateUsage(usage: ModelUsage, isFreeUsage: boolean) {
    const includedUsageTypes = Object.keys(usage.usage);
    if (!isFreeUsage && includedUsageTypes.length === 0) {
        throw new Error("No usage headers where present for a non-free model");
    }
}

function extractUserTier(c: Context<TrackEnv>): string | undefined {
    return c.var.auth.user?.tier;
}

function extractContentFilterResults(
    headers: Headers | Record<string, string>,
): GenerationEventContentFilterParams {
    const plainHeaders =
        headers instanceof Headers
            ? Object.fromEntries(headers.entries())
            : headers;
    const parseResult =
        ContentFilterResultHeadersSchema.safeParse(plainHeaders);
    if (parseResult.success) {
        return parseResult.data;
    }
    return {};
}

type CacheInfo = {
    cacheHit: boolean;
    cacheKey?: string;
    cacheType?: "exact" | "semantic";
    cacheSemanticSimilarity?: number;
    cacheSemanticThreshold?: number;
};

function extractCacheHeaders(c: Context<TrackEnv>): CacheInfo {
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

// biome-ignore format: custom formatting
const ContentFilterResultHeadersSchema = z
    .object({
        "x-moderation-prompt-hate-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-prompt-self-harm-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-prompt-sexual-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-prompt-violence-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-prompt-jailbreak-detected": 
            z.boolean().optional().catch(undefined),
        "x-moderation-completion-hate-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-self-harm-severity":
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-sexual-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-violence-severity":
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-protected-material-text-detected": 
            z.boolean().optional().catch(undefined),
        "x-moderation-completion-protected-material-code-detected": 
            z.boolean().optional().catch(undefined),
    })
    .transform((headers) => removeUnset({
        moderationPromptHateSeverity:
            headers["x-moderation-prompt-hate-severity"],
        moderationPromptSelfHarmSeverity:
            headers["x-moderation-prompt-self-harm-severity"],
        moderationPromptSexualSeverity:
            headers["x-moderation-prompt-sexual-severity"],
        moderationPromptViolenceSeverity:
            headers["x-moderation-prompt-violence-severity"],
        moderationPromptJailbreakDetected:
            headers["x-moderation-prompt-jailbreak-detected"],
        moderationCompletionHateSeverity:
            headers["x-moderation-completion-hate-severity"],
        moderationCompletionSelfHarmSeverity:
            headers["x-moderation-completion-self-harm-severity"],
        moderationCompletionSexualSeverity:
            headers["x-moderation-completion-sexual-severity"],
        moderationCompletionViolenceSeverity:
            headers["x-moderation-completion-violence-severity"],
        moderationCompletionProtectedMaterialTextDetected:
            headers["x-moderation-completion-protected-material-text-detected"],
        moderationCompletionProtectedMaterialCodeDetected:
            headers["x-moderation-completion-protected-material-code-detected"],
    }));
