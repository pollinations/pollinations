import { processEvents, storeEvents } from "@/events.ts";
import {
    getActivePriceDefinition,
    calculateCost,
    calculatePrice,
    ServiceId,
    ModelId,
    UsageCost,
    UsagePrice,
    PriceDefinition,
    getServiceDefinition,
} from "@shared/registry/registry.ts";
import type { ModelVariables } from "./model.ts";
import {
    openaiUsageToTokenUsage,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import { routePath, baseRoutePath } from "hono/route";
import {
    CompletionUsage,
    CompletionUsageSchema,
    ContentFilterResult,
    ContentFilterResultSchema,
    ContentFilterSeveritySchema,
} from "@/schemas/openai.ts";
import { generateRandomId } from "@/util.ts";
import { createMiddleware } from "hono/factory";
import {
    contentFilterResultsToEventParams,
    priceToEventParams,
    usageToEventParams,
} from "@/db/schema/event.ts";
import { drizzle } from "drizzle-orm/d1";
import { HonoRequest } from "hono";
import type {
    ApiKeyType,
    EventType,
    GenerationEventContentFilterParams,
    InsertGenerationEvent,
} from "@/db/schema/event.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { PolarVariables } from "./polar.ts";
import { z } from "zod";
import { TokenUsage } from "../../../shared/registry/registry.js";
import { removeUnset } from "@/util.ts";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { mergeContentFilterResults } from "@/content-filter.ts";
import {
    getDefaultErrorMessage,
    getErrorCode,
    UpstreamError,
} from "@/error.ts";
import type { LoggerVariables } from "./logger.ts";
import type { ErrorVariables } from "@/env.ts";
import type { FrontendKeyRateLimitVariables } from "./rate-limit-durable.ts";
import { getLogger } from "@logtape/logtape";

// Simple token estimation function for fallback billing
function estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters on average i hope
    return Math.ceil(text.length / 4);
}

// Est. usage from partial stream data
function estimateUsageFromStream(
    model: ModelId,
    promptText: string = "",
    completionText: string = "",
): TokenUsage {
    const promptTokens = estimateTokens(promptText);
    const completionTokens = estimateTokens(completionText);
    
    return {
        unit: "TOKENS" as const,
        promptTextTokens: promptTokens,
        completionTextTokens: completionTokens,
    };
}

export type ModelUsage = {
    model: ModelId;
    usage: TokenUsage;
};

type RequestTrackingData = {
    modelRequested: string | null;
    resolvedModelRequested: string;
    modelProvider?: string;
    modelPriceDefinition: PriceDefinition;
    streamRequested: boolean;
    referrerData: ReferrerData;
};

type ResponseTrackingData = {
    responseStatus: number;
    responseOk: boolean;
    cacheData: CacheData;
    isBilledUsage: boolean;
    modelUsed?: string;
    usage?: TokenUsage;
    cost?: UsageCost;
    price?: UsagePrice;
    contentFilterResults?: GenerationEventContentFilterParams;
};

export type TrackVariables = {
    track: {
        modelRequested: string | null;
        resolvedModelRequested: string;
        streamRequested: boolean;
        overrideResponseTracking: (response: Response) => void;
    };
};

export type TrackEnv = {
    Bindings: CloudflareBindings;
    Variables: ErrorVariables &
        LoggerVariables &
        AuthVariables &
        PolarVariables &
        FrontendKeyRateLimitVariables &
        TrackVariables &
        ModelVariables;
};

export const track = (eventType: EventType) =>
    createMiddleware<TrackEnv>(async (c, next) => {
        const log = c.get("log");
        const startTime = new Date();

        // Get model from resolveModel middleware
        const modelInfo = c.var.model;
        const requestTracking = await trackRequest(modelInfo, c.req);
        let responseOverride = null;

        c.set("track", {
            modelRequested: requestTracking.modelRequested,
            resolvedModelRequested: requestTracking.resolvedModelRequested,
            streamRequested: requestTracking.streamRequested,
            overrideResponseTracking: (response: Response) => {
                responseOverride = response;
            },
        });

        await next();

        const endTime = new Date();

        c.executionCtx.waitUntil(
            (async () => {
                const response = responseOverride || c.res.clone();
                
                // Log if this is a streaming request that might be vulnerable to disconnect exploits
                if (requestTracking.streamRequested) {
                    log.info("Processing streaming response with enhanced billing protection");
                }
                
                const responseTracking = await trackResponse(
                    eventType,
                    requestTracking,
                    response,
                );

                // register pollen consumption with rate limiter
                const billedAmount = responseTracking.price?.totalPrice || 0;
                await c.var.frontendKeyRateLimit?.consumePollen(billedAmount);
                
                // Log billing outcome for monitoring
                if (responseTracking.isBilledUsage) {
                    log.info("Successfully billed streaming request: ${amount} for model {model}", {
                        amount: billedAmount,
                        model: responseTracking.modelUsed,
                        tokens: responseTracking.usage,
                    });
                } else {
                    log.warn("Streaming request not billed - this should be rare");
                }

                const userTracking: UserData = {
                    userId: c.var.auth.user?.id,
                    userTier: c.var.auth.user?.tier,
                    userGithubId: `${c.var.auth.user?.githubId}`,
                    userGithubUsername: c.var.auth.user?.githubUsername,
                    apiKeyId: c.var.auth.apiKey?.id,
                    apiKeyType: c.var.auth.apiKey?.metadata
                        ?.keyType as ApiKeyType,
                    apiKeyName: c.var.auth.apiKey?.name,
                } satisfies UserData;

                const balanceTracking = {
                    selectedMeterId:
                        c.var.polar.balanceCheckResult?.selectedMeterId,
                    selectedMeterSlug:
                        c.var.polar.balanceCheckResult?.selectedMeterSlug,
                    balances: Object.fromEntries(
                        c.var.polar.balanceCheckResult?.meters.map((meter) => [
                            meter.metadata.slug,
                            meter.balance,
                        ]) || [],
                    ),
                } satisfies BalanceData;

                const event = createTrackingEvent({
                    requestId: c.get("requestId"),
                    requestPath: `${routePath(c)}`,
                    startTime,
                    endTime,
                    environment: c.env.ENVIRONMENT,
                    eventType,
                    userTracking,
                    balanceTracking,
                    requestTracking,
                    responseTracking,
                    errorTracking: collectErrorData(response, c.get("error")),
                });

                log.trace("Event: {event}", { event });
                const db = drizzle(c.env.DB);
                await storeEvents(db, c.var.log, [event]);

                // process events immediately in development/testing
                if (
                    ["test", "development", "local"].includes(c.env.ENVIRONMENT)
                ) {
                    log.trace("Processing events immediately");
                    await processEvents(db, c.var.log, {
                        polarAccessToken: c.env.POLAR_ACCESS_TOKEN,
                        polarServer: c.env.POLAR_SERVER,
                        tinybirdIngestUrl: c.env.TINYBIRD_INGEST_URL,
                        tinybirdAccessToken: c.env.TINYBIRD_ACCESS_TOKEN,
                        minBatchSize: 0, // process all events immediately
                        minRetryDelay: 0, // don't wait between retries
                        maxRetryDelay: 0, // don't wait between retries
                    });
                }
            })(),
        );
    });

async function trackRequest(
    modelInfo: ModelVariables["model"],
    request: HonoRequest,
): Promise<RequestTrackingData> {
    // Model is already resolved by the resolveModel middleware
    const modelRequested = modelInfo.requested;
    const resolvedModelRequested = modelInfo.resolved;

    const modelProvider = getServiceDefinition(resolvedModelRequested).provider;
    const modelPriceDefinition = getActivePriceDefinition(
        resolvedModelRequested,
    );
    if (!modelPriceDefinition) {
        throw new Error(
            `Failed to get price definition for model: ${resolvedModelRequested}`,
        );
    }
    const streamRequested = await extractStreamRequested(request);
    const referrerData = extractReferrerHeader(request);

    return {
        modelRequested,
        resolvedModelRequested,
        modelProvider,
        modelPriceDefinition,
        streamRequested,
        referrerData,
    };
}

async function trackResponse(
    eventType: EventType,
    requestTracking: RequestTrackingData,
    response: Response,
): Promise<ResponseTrackingData> {
    const log = getLogger(["hono", "track", "response"]);
    const { resolvedModelRequested } = requestTracking;
    const cacheInfo = extractCacheHeaders(response);
    if (!response.ok || cacheInfo.cacheHit) {
        return {
            responseOk: response.ok,
            responseStatus: response.status,
            cacheData: cacheInfo,
            isBilledUsage: false,
        };
    }
    const { modelUsage, contentFilterResults } =
        await extractUsageAndContentFilterResults(
            eventType,
            requestTracking,
            response,
        );
    if (!modelUsage) {
        log.error("Failed to extract model usage");
        // CRITICAL FIX: Always bill something to prevent infinite free exploit
        // Even if we can't extract usage, bill a minimal amount
        const minimalUsage: TokenUsage = {
            unit: "TOKENS" as const,
            promptTextTokens: 1,
            completionTextTokens: 1,
        };
        const minimalCost = calculateCost(resolvedModelRequested as ModelId, minimalUsage);
        const minimalPrice = calculatePrice(resolvedModelRequested as ServiceId, minimalUsage);
        
        return {
            responseOk: response.ok,
            responseStatus: response.status,
            cacheData: cacheInfo,
            isBilledUsage: true, // Force billing even on failure
            cost: minimalCost,
            price: minimalPrice,
            modelUsed: resolvedModelRequested as ModelId,
            usage: minimalUsage,
            contentFilterResults,
        };
    }
    const cost = calculateCost(modelUsage.model as ModelId, modelUsage.usage);
    const price = calculatePrice(
        resolvedModelRequested as ServiceId,
        modelUsage.usage,
    );
    return {
        responseOk: response.ok,
        responseStatus: response.status,
        cacheData: cacheInfo,
        isBilledUsage: true,
        cost,
        price,
        modelUsed: modelUsage.model,
        usage: modelUsage.usage,
        contentFilterResults,
    };
}

async function* extractResponseStream(
    response: Response,
): AsyncGenerator<unknown> {
    if (!response.body) return;

    const textDecoder = new TextDecoderStream();
    const sseParser = new EventSourceParserStream();
    const eventStream = response.body
        .pipeThrough(textDecoder)
        .pipeThrough(sseParser);

    try {
        for await (const event of asyncIteratorStream(eventStream)) {
            if (event.data === "[DONE]") return;
            yield JSON.parse(event.data);
        }
    } catch (error) {
        // Log but don't rethrow - we need to ensure billing happens
        const log = getLogger(["hono", "track", "stream"]);
        log.warn("Stream extraction interrupted (likely client disconnect): {error}", { error });
        // Return gracefully to allow billing to proceed with partial data
        return;
    }
}

async function* asyncIteratorStream<T>(
    stream: ReadableStream<T>,
): AsyncGenerator<T> {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

type UserData = {
    userId?: string;
    userTier?: string;
    userGithubId?: string;
    userGithubUsername?: string;
    apiKeyId?: string;
    apiKeyType?: ApiKeyType;
    apiKeyName?: string;
};

type BalanceData = {
    selectedMeterId?: string;
    selectedMeterSlug?: string;
    balances: Record<string, number>;
};

type TrackingEventInput = {
    requestId: string;
    requestPath: string;
    startTime: Date;
    endTime: Date;
    environment: string;
    eventType: EventType;
    userTracking: UserData;
    balanceTracking: BalanceData;
    requestTracking: RequestTrackingData;
    responseTracking: ResponseTrackingData;
    errorTracking?: ErrorData;
};

function createTrackingEvent({
    requestId,
    requestPath,
    startTime,
    endTime,
    environment,
    eventType,
    userTracking,
    balanceTracking,
    requestTracking,
    responseTracking,
    errorTracking,
}: TrackingEventInput): InsertGenerationEvent {
    return {
        id: generateRandomId(),
        requestId,
        requestPath,
        startTime,
        endTime,
        responseTime: endTime.getTime() - startTime.getTime(),
        responseStatus: responseTracking.responseStatus,
        environment,
        eventType,

        ...userTracking,
        ...requestTracking.referrerData,
        ...responseTracking.cacheData,

        modelRequested: requestTracking.modelRequested,
        resolvedModelRequested: requestTracking.resolvedModelRequested,
        modelUsed: responseTracking.modelUsed,
        modelProviderUsed: requestTracking.modelProvider,

        isBilledUsage: responseTracking.isBilledUsage,

        ...balanceTracking,

        ...priceToEventParams(requestTracking.modelPriceDefinition),
        ...usageToEventParams(responseTracking.usage),

        totalCost: responseTracking.cost?.totalCost || 0,
        totalPrice: responseTracking.price?.totalPrice || 0,

        ...responseTracking.contentFilterResults,
        ...errorTracking,
    };
}

async function extractStreamRequested(request: HonoRequest): Promise<boolean> {
    if (request.method === "GET") {
        const stream = request.param("stream");
        return z.safeParse(z.coerce.boolean(), stream).data || false;
    }
    if (request.method === "POST") {
        const stream = (await request.json()).stream;
        return z.safeParse(z.coerce.boolean(), stream).data || false;
    }
    return false;
}

function extractUsageHeaders(response: Response): ModelUsage {
    const modelUsed = response.headers.get("x-model-used");
    if (!modelUsed) {
        throw new Error(
            "Failed to determine model: x-model-used header was missing",
        );
    }
    const usage = parseUsageHeaders(response.headers);
    return {
        model: modelUsed as ModelId,
        usage,
    };
}

function extractContentFilterHeaders(
    response: Response,
): GenerationEventContentFilterParams {
    const parseResult = ContentFilterResultHeadersSchema.safeParse(
        Object.fromEntries(response.headers.entries()),
    );
    return parseResult.data || {};
}

function extractUsageAndContentFilterResultsHeaders(response: Response): {
    modelUsage: ModelUsage;
    contentFilterResults: GenerationEventContentFilterParams;
} {
    return {
        modelUsage: extractUsageHeaders(response),
        contentFilterResults: extractContentFilterHeaders(response),
    };
}

async function extractUsageAndContentFilterResultsStream(
    events: AsyncIterable<unknown>,
): Promise<{
    modelUsage: ModelUsage | null;
    contentFilterResults: GenerationEventContentFilterParams;
}> {
    const log = getLogger(["hono", "track", "stream"]);
    const EventSchema = z.object({
        model: z.string(),
        usage: CompletionUsageSchema.nullish(),
        choices: z.array(
            z.object({
                delta: z.object({
                    content: z.string().optional(),
                }).optional(),
                content_filter_results: ContentFilterResultSchema.nullish(),
            }),
        ),
        prompt_filter_results: z
            .array(
                z.object({
                    content_filter_results: ContentFilterResultSchema,
                }),
            )
            .nullish(),
    });

    let model = undefined;
    let usage: CompletionUsage | undefined = undefined;
    let promptFilterResults: ContentFilterResult = {};
    let completionFilterResults: ContentFilterResult = {};
    
    // Track partial content for fallback billing
    let accumulatedContent = "";
    let hasUsageFromStream = false;

    try {
        for await (const event of events) {
            const parseResult = EventSchema.safeParse(event);

            const incomingPromptFilterResults =
                parseResult.data?.prompt_filter_results?.map(
                    (entry) => entry.content_filter_results,
                ) || [];

            promptFilterResults = mergeContentFilterResults([
                ...incomingPromptFilterResults,
                promptFilterResults,
            ]);

            const incomingCompletionFilterResults =
                parseResult.data?.choices[0]?.content_filter_results;

            completionFilterResults = mergeContentFilterResults([
                incomingCompletionFilterResults || {},
                completionFilterResults,
            ]);

            // Accumulate content for fallback billing
            const deltaContent = parseResult.data?.choices[0]?.delta?.content;
            if (deltaContent) {
                accumulatedContent += deltaContent;
            }

            if (parseResult.data?.usage) {
                if (usage) {
                    log.warn("Multiple usage objects found in event stream");
                }
                usage = parseResult.data?.usage;
                model = parseResult.data?.model;
                hasUsageFromStream = true;
            }
        }
    } catch (error) {
        // Client disconnected mid-stream - we still need to bill for partial usage
        log.warn("Stream interrupted, using partial usage data: {error}", { error });
    }

    const contentFilterResults = contentFilterResultsToEventParams({
        promptFilterResults,
        completionFilterResults,
    });

    // Determine model for billing
    if (!model) {
        log.warn("No model found in stream, cannot bill for usage");
        return {
            modelUsage: null,
            contentFilterResults,
        };
    }

    // Use actual usage if available, otherwise estimate from accumulated content
    let finalUsage: TokenUsage;
    if (usage) {
        finalUsage = openaiUsageToTokenUsage(usage);
    } else {
        // Fallback: estimate usage from accumulated content
        log.warn("No usage object in stream, estimating from content length");
        finalUsage = estimateUsageFromStream(model as ModelId, "", accumulatedContent);
    }

    return {
        modelUsage: {
            model: model as ModelId,
            usage: finalUsage,
        },
        contentFilterResults,
    };
}

async function extractUsageAndContentFilterResults(
    eventType: EventType,
    requestTracking: RequestTrackingData,
    response: Response,
): Promise<{
    modelUsage: ModelUsage | null;
    contentFilterResults: GenerationEventContentFilterParams;
}> {
    if (
        eventType === "generate.text" &&
        requestTracking.streamRequested &&
        response.body instanceof ReadableStream
    ) {
        const log = getLogger(["hono", "track", "extract"]);
        
        try {
            // Clone the response to avoid consuming the original stream
            const clonedResponse = response.clone();
            const eventStream = extractResponseStream(clonedResponse);
            const result = await extractUsageAndContentFilterResultsStream(eventStream);
            
            // Ensure we always return some billing data, even if stream was interrupted
            if (!result.modelUsage) {
                log.warn("No usage data extracted from stream, providing fallback");
                // Return minimal billing data to prevent infinite free usage
                return {
                    modelUsage: {
                        model: requestTracking.resolvedModelRequested as ModelId,
                        usage: {
                            unit: "TOKENS" as const,
                            promptTextTokens: 1,
                            completionTextTokens: 1,
                        },
                    },
                    contentFilterResults: result.contentFilterResults,
                };
            }
            
            return result;
        } catch (error) {
            log.error("Failed to extract usage from stream: {error}", { error });
            // Ensure billing still happens even if extraction fails
            return {
                modelUsage: {
                    model: requestTracking.resolvedModelRequested as ModelId,
                    usage: {
                        unit: "TOKENS" as const,
                        promptTextTokens: 0,
                        completionTextTokens: 10, // Reasonable minimum for failed extraction
                    },
                },
                contentFilterResults: contentFilterResultsToEventParams({
                    promptFilterResults: {},
                    completionFilterResults: {},
                }),
            };
        }
    }
    return extractUsageAndContentFilterResultsHeaders(response);
}

type CacheData = {
    cacheHit: boolean;
    cacheKey?: string;
    cacheType?: "exact" | "semantic";
    cacheSemanticSimilarity?: number;
    cacheSemanticThreshold?: number;
};

function extractCacheHeaders(response: Response): CacheData {
    return {
        cacheHit: response.headers.get("x-cache") === "HIT",
        cacheKey: response.headers.get("x-cache-key") || undefined,
        cacheType: z
            .enum(["exact", "semantic"])
            .safeParse(response.headers.get("x-cache-type")).data,
        cacheSemanticSimilarity: z
            .number()
            .safeParse(response.headers.get("x-cache-semantic-similarity"))
            .data,
        cacheSemanticThreshold: z
            .number()
            .safeParse(response.headers.get("x-cache-semantic-threshold")).data,
    };
}

type ReferrerData = {
    referrerUrl?: string;
    referrerDomain?: string;
};

function extractReferrerHeader(request: HonoRequest): ReferrerData {
    const referrerUrl = request.header("referer") || undefined;
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

type ErrorData = {
    errorResponseCode?: string;
    errorSource?: string;
    errorMessage?: string;
    // errorStack and errorDetails removed to reduce D1 memory usage
};

function collectErrorData(response: Response, error?: Error): ErrorData {
    if (response.ok && !error) return {};
    let source: string | undefined;
    if (error instanceof UpstreamError) {
        source = error.requestUrl?.hostname;
    }
    // Note: errorStack and errorDetails removed to reduce D1 memory usage
    // Stack traces and details are still logged but not stored in the database
    return {
        errorResponseCode: getErrorCode(response.status),
        errorSource: source,
        errorMessage: error?.message || getDefaultErrorMessage(response.status),
    };
}
