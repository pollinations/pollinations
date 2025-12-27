import { processEvents, storeEvents, updateEvent } from "@/events.ts";
import { getModelStats, getEstimatedPrice } from "@/utils/model-stats.ts";
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
import { routePath } from "hono/route";
import {
    CompletionUsage,
    CompletionUsageSchema,
    ContentFilterResult,
    ContentFilterResultSchema,
    ContentFilterSeveritySchema,
    CreateChatCompletionStreamResponseSchema,
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
    EstimateGenerationEvent,
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
    promptTokensEstimated?: number;
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
        const log = getLogger(["hono", "track"]);
        const startTime = new Date();
        const db = drizzle(c.env.DB);

        // Get model from resolveModel middleware
        const modelInfo = c.var.model;
        const requestTracking = await trackRequest(modelInfo, c.req);

        const userTracking: UserData = {
            userId: c.var.auth.user?.id,
            userTier: c.var.auth.user?.tier,
            userGithubId: `${c.var.auth.user?.githubId}`,
            userGithubUsername: c.var.auth.user?.githubUsername,
            apiKeyId: c.var.auth.apiKey?.id,
            apiKeyType: c.var.auth.apiKey?.metadata?.keyType as ApiKeyType,
            apiKeyName: c.var.auth.apiKey?.name,
        } satisfies UserData;

        let responseOverride = null;

        c.set("track", {
            modelRequested: requestTracking.modelRequested,
            resolvedModelRequested: requestTracking.resolvedModelRequested,
            streamRequested: requestTracking.streamRequested,
            overrideResponseTracking: (response: Response) => {
                responseOverride = response;
            },
        });

        let estimateEventId: string | undefined = generateRandomId();

        if (userTracking.userId) {
            try {
                const modelStats = await getModelStats(c.env.KV, log);
                const estimatedPrice = getEstimatedPrice(
                    modelStats,
                    requestTracking.resolvedModelRequested,
                );

                const estimateEvent = createEstimateEvent({
                    id: estimateEventId,
                    requestId: c.get("requestId"),
                    requestPath: `${routePath(c)}`,
                    startTime,
                    environment: c.env.ENVIRONMENT,
                    eventType,
                    userTracking,
                    requestTracking,
                    estimatedPrice,
                });

                await storeEvents(db, log, [estimateEvent]);
                log.debug(
                    "Inserted estimate event: {estimateEventId} with estimatedPrice={estimatedPrice}",
                    { estimateEventId, estimatedPrice },
                );
            } catch (error) {
                log.error("Failed to insert estimate event: {error}", {
                    error,
                });
                // Insertion failed, reset estimate event
                estimateEventId = undefined;
            }
        }

        await next();

        const endTime = new Date();

        c.executionCtx.waitUntil(
            (async () => {
                const response = responseOverride || c.res.clone();
                const responseTracking = await trackResponse(
                    eventType,
                    requestTracking,
                    response,
                );

                // register pollen consumption with rate limiter
                await c.var.frontendKeyRateLimit?.consumePollen(
                    responseTracking.price?.totalPrice || 0,
                );

                // Capture balance tracking AFTER next() so balanceCheckResult is set
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

                const finalEvent = createTrackingEvent({
                    id: estimateEventId || generateRandomId(),
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

                log.trace(
                    [
                        "Tracking event:",
                        "  isBilledUsage={event.isBilledUsage}",
                        "  balances[v1:meter:tier]={event.balances[v1:meter:tier]}",
                        "  balances[v1:meter:pack]={event.balances[v1:meter:pack]}",
                        '  selectedMeterSlug="{event.selectedMeterSlug}"',
                        "  totalCost={event.totalCost}",
                        "  totalPrice={event.totalPrice}",
                    ].join("\n"),
                    { event: finalEvent },
                );

                if (estimateEventId) {
                    // Update the estimate event with all final data
                    await updateEvent(db, log, estimateEventId, finalEvent);
                    log.debug(
                        "Updated estimate event {eventId} with actual data",
                        { eventId: estimateEventId },
                    );
                } else {
                    // No pending event was inserted, store a new event
                    await storeEvents(db, c.var.log, [finalEvent]);
                }

                // process events immediately in development/testing
                if (
                    ["test", "development", "local"].includes(c.env.ENVIRONMENT)
                ) {
                    log.trace(
                        "Processing events immediately (ENVIRONMENT={environment})",
                        { environment: c.env.ENVIRONMENT },
                    );
                    await processEvents(db, log.getChild("events"), {
                        polarAccessToken: c.env.POLAR_ACCESS_TOKEN,
                        polarServer: c.env.POLAR_SERVER,
                        tinybirdIngestUrl: c.env.TINYBIRD_INGEST_URL,
                        tinybirdIngestToken: c.env.TINYBIRD_INGEST_TOKEN,
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

    let promptTokensEstimated = 0;
    try {
        // We can safely read JSON here because it was already validated and cached by Hono
        const body = await request.json();
        if (body.messages && Array.isArray(body.messages)) {
            const content = body.messages
                .map((m: any) =>
                    typeof m.content === "string"
                        ? m.content
                        : JSON.stringify(m.content),
                )
                .join("");
            // Estimate tokens: roughly 4 characters per token
            promptTokensEstimated = Math.ceil(content.length / 4);
        }
    } catch (e) {
        // Ignore errors if body is not JSON or not available
    }

    return {
        modelRequested,
        resolvedModelRequested,
        modelProvider,
        modelPriceDefinition,
        streamRequested,
        referrerData,
        promptTokensEstimated,
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

    // For image generation, verify the response is actually an image
    // Don't bill if the response is JSON/text (error response with HTTP 200)
    if (eventType === "generate.image") {
        const contentType = response.headers.get("content-type") || "";
        if (
            !contentType.startsWith("image/") &&
            !contentType.startsWith("video/")
        ) {
            log.warn(
                "Image generation returned non-image content-type: {contentType}",
                { contentType },
            );
            return {
                responseOk: response.ok,
                responseStatus: response.status,
                cacheData: cacheInfo,
                isBilledUsage: false,
            };
        }
    }
    const { modelUsage, contentFilterResults } =
        await extractUsageAndContentFilterResults(
            eventType,
            requestTracking,
            response,
        );
    if (!modelUsage) {
        log.error("Failed to extract model usage");
        return {
            responseOk: response.ok,
            responseStatus: response.status,
            cacheData: cacheInfo,
            isBilledUsage: false,
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

    for await (const event of asyncIteratorStream(eventStream)) {
        if (event.data === "[DONE]") return;
        yield JSON.parse(event.data);
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

type EstimateEventInput = {
    id: string;
    requestId: string;
    requestPath: string;
    startTime: Date;
    environment: string;
    eventType: EventType;
    userTracking: UserData;
    requestTracking: RequestTrackingData;
    estimatedPrice: number;
};

function createEstimateEvent({
    id,
    requestId,
    requestPath,
    startTime,
    environment,
    eventType,
    userTracking,
    requestTracking,
    estimatedPrice,
}: EstimateEventInput): InsertGenerationEvent {
    return {
        id,
        eventStatus: "estimate",
        requestId,
        requestPath,
        startTime,
        environment,
        eventType,

        ...userTracking,
        ...requestTracking.referrerData,

        modelRequested: requestTracking.modelRequested,
        resolvedModelRequested: requestTracking.resolvedModelRequested,
        modelProviderUsed: requestTracking.modelProvider,

        isBilledUsage: false,
        estimatedPrice,

        ...priceToEventParams(requestTracking.modelPriceDefinition),
    };
}

type TrackingEventInput = {
    id: string;
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
    id,
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
        id,
        eventStatus: "pending",
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
    promptTokensEstimated = 0,
): Promise<{
    modelUsage: ModelUsage | null;
    contentFilterResults: GenerationEventContentFilterParams;
}> {
    const log = getLogger(["hono", "track", "stream"]);
    const EventSchema = CreateChatCompletionStreamResponseSchema;

    let model = undefined;
    let usage: CompletionUsage | undefined = undefined;
    let promptFilterResults: ContentFilterResult = {};
    let completionFilterResults: ContentFilterResult = {};

    let accumulatedContent = "";
    let accumulatedReasoningContent = "";

    try {
        for await (const event of events) {
            const parseResult = EventSchema.safeParse(event);
            if (!parseResult.success) {
                continue;
            }

            const eventData = parseResult.data;
            const choice = eventData.choices?.[0];

            if (choice?.delta?.content) {
                accumulatedContent += choice.delta.content;
            }
            if (choice?.delta?.reasoning_content) {
                accumulatedReasoningContent += choice.delta.reasoning_content;
            }

            const incomingPromptFilterResults =
                eventData.prompt_filter_results?.map(
                    (entry: any) => entry.content_filter_results,
                ) || [];

            promptFilterResults = mergeContentFilterResults([
                ...incomingPromptFilterResults,
                promptFilterResults,
            ]);

            const incomingCompletionFilterResults =
                choice?.content_filter_results;

            completionFilterResults = mergeContentFilterResults([
                incomingCompletionFilterResults || {},
                completionFilterResults,
            ]);

            if (eventData.usage) {
                if (usage) {
                    log.warn("Multiple usage objects found in event stream");
                }
                usage = eventData.usage;
            }

            if (eventData.model) {
                model = eventData.model;
            }
        }
    } catch (e) {
        log.warn("Stream interrupted or failed to parse: {error}", {
            error: e,
        });
    }

    const contentFilterResults = contentFilterResultsToEventParams({
        promptFilterResults,
        completionFilterResults,
    });

    if (!model || !usage) {
        if (accumulatedContent || accumulatedReasoningContent) {
            log.warn(
                "Usage missing but content found (stream likely interrupted), estimating usage",
            );
            // Estimate tokens: roughly 4 characters per token
            const estimatedCompletionTokens = Math.ceil(
                (accumulatedContent.length + accumulatedReasoningContent.length) /
                    4,
            );
            usage = {
                prompt_tokens: promptTokensEstimated,
                completion_tokens: estimatedCompletionTokens,
                total_tokens: promptTokensEstimated + estimatedCompletionTokens,
            };
            // Fallback model if not seen in stream
            model = model || "unknown";
        } else {
            log.error("No usage object or content found in event stream");
            return {
                modelUsage: null,
                contentFilterResults,
            };
        }
    }

    return {
        modelUsage: {
            model: model as ModelId,
            usage: openaiUsageToTokenUsage(usage),
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
        const eventStream = extractResponseStream(response);
        return await extractUsageAndContentFilterResultsStream(
            eventStream,
            requestTracking.promptTokensEstimated,
        );
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
