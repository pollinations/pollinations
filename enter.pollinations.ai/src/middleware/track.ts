import { getLogger } from "@logtape/logtape";
import type { Usage } from "@shared/registry/registry.ts";
import {
    calculateCost,
    calculatePrice,
    getActivePriceDefinition,
    getServiceDefinition,
    type ModelId,
    type PriceDefinition,
    type ServiceId,
    type UsageCost,
    type UsagePrice,
} from "@shared/registry/registry.ts";
import {
    openaiUsageToUsage,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { EventSourceParserStream } from "eventsource-parser/stream";
import type { HonoRequest } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { z } from "zod";
import { mergeContentFilterResults } from "@/content-filter.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@/db/schema/better-auth.ts";
import type {
    ApiKeyType,
    EventType,
    GenerationEventContentFilterParams,
    InsertGenerationEvent,
} from "@/db/schema/event.ts";
import {
    contentFilterResultsToEventParams,
    priceToEventParams,
    usageToEventParams,
} from "@/db/schema/event.ts";
import type { ErrorVariables } from "@/env.ts";
import {
    getDefaultErrorMessage,
    getErrorCode,
    UpstreamError,
} from "@/error.ts";
import { sendToTinybird } from "@/events.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
    type ContentFilterResult,
    ContentFilterResultSchema,
    ContentFilterSeveritySchema,
} from "@/schemas/openai.ts";
import { generateRandomId, removeUnset } from "@/util.ts";
import {
    atomicDeductApiKeyBalance,
    atomicDeductUserBalance,
    calculateDeductionSplit,
    getUserBalances,
} from "@/utils/balance-deduction.ts";
import type { LoggerVariables } from "./logger.ts";
import type { ModelVariables } from "./model.ts";
import type { PolarVariables } from "./polar.ts";
import type { FrontendKeyRateLimitVariables } from "./rate-limit-durable.ts";

export type ModelUsage = {
    model: ModelId;
    usage: Usage;
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
    usage?: Usage;
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
                    id: generateRandomId(),
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

                await sendToTinybird(
                    finalEvent,
                    c.env.TINYBIRD_INGEST_URL,
                    c.env.TINYBIRD_INGEST_TOKEN,
                    log,
                );

                // Decrement per-key pollen budget after billable requests
                // Only deduct if key has a budget set (pollenBalance is not null)
                const apiKeyId = c.var.auth?.apiKey?.id;
                const apiKeyPollenBalance = c.var.auth?.apiKey?.pollenBalance;
                if (
                    responseTracking.isBilledUsage &&
                    responseTracking.price?.totalPrice &&
                    apiKeyId &&
                    apiKeyPollenBalance !== null &&
                    apiKeyPollenBalance !== undefined
                ) {
                    const priceToDeduct = responseTracking.price.totalPrice;

                    try {
                        // Use atomic deduction function
                        await atomicDeductApiKeyBalance(
                            db,
                            apikeyTable,
                            apiKeyId,
                            priceToDeduct,
                        );

                        log.debug(
                            "Decremented {price} pollen from API key {keyId} budget",
                            {
                                price: priceToDeduct,
                                keyId: apiKeyId,
                            },
                        );
                    } catch (error) {
                        log.error(
                            "Failed to decrement API key budget for {keyId}: {error}",
                            {
                                keyId: apiKeyId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : error,
                            },
                        );
                    }
                }

                // Decrement user pollen balance after billable requests
                // Strategy: decrement from tier_balance first, then crypto_balance, then pack_balance
                if (
                    responseTracking.isBilledUsage &&
                    responseTracking.price?.totalPrice &&
                    userTracking.userId
                ) {
                    const priceToDeduct = responseTracking.price.totalPrice;

                    try {
                        // Get current balances for logging purposes
                        const balancesBefore = await getUserBalances(
                            db,
                            userTracking.userId,
                        );

                        // Calculate how the deduction will be split (for logging)
                        const deductionSplit = calculateDeductionSplit(
                            balancesBefore.tierBalance,
                            balancesBefore.cryptoBalance,
                            balancesBefore.packBalance,
                            priceToDeduct,
                        );

                        // Perform atomic deduction
                        await atomicDeductUserBalance(
                            db,
                            userTracking.userId,
                            priceToDeduct,
                        );

                        log.debug(
                            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, crypto: -{fromCrypto}, pack: -{fromPack})",
                            {
                                price: priceToDeduct,
                                userId: userTracking.userId,
                                fromTier: deductionSplit.fromTier,
                                fromCrypto: deductionSplit.fromCrypto,
                                fromPack: deductionSplit.fromPack,
                            },
                        );
                    } catch (error) {
                        log.error(
                            "Failed to decrement user balance for {userId}: {error}",
                            {
                                userId: userTracking.userId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : error,
                            },
                        );
                    }
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
    // Use service's canonical modelId for cost (not the provider's model ID from response)
    const serviceModelId = getServiceDefinition(
        resolvedModelRequested as ServiceId,
    ).modelId;
    const cost = calculateCost(serviceModelId as ModelId, modelUsage.usage);
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

    let model: string | undefined;
    let usage: CompletionUsage | undefined;
    let promptFilterResults: ContentFilterResult = {};
    let completionFilterResults: ContentFilterResult = {};

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

        if (parseResult.data?.usage) {
            if (usage) {
                log.warn("Multiple usage objects found in event stream");
            }
            usage = parseResult.data?.usage;
            model = parseResult.data?.model;
        }
    }

    const contentFilterResults = contentFilterResultsToEventParams({
        promptFilterResults,
        completionFilterResults,
    });

    if (!model || !usage) {
        log.error("No usage object found in event stream");
        return {
            modelUsage: null,
            contentFilterResults,
        };
    }

    return {
        modelUsage: {
            model: model as ModelId,
            usage: openaiUsageToUsage(usage),
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
        return await extractUsageAndContentFilterResultsStream(eventStream);
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
