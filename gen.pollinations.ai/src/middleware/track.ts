import { getLogger } from "@logtape/logtape";
import type { ApiKeyType } from "@shared/auth/api-key-creation.ts";
import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import { payerBucketToMeter } from "@shared/billing/balance.ts";
import {
    type CommunityModelRewardResolution,
    handleBalanceDeduction,
    type MarkupResolution,
} from "@shared/billing/track-helpers.ts";
import {
    getRealClientIp,
    hashIp,
    stripIPv4MappedPrefix,
    truncateIpToSubnet,
} from "@shared/client-ip.ts";
import {
    COMMUNITY_MODEL_REWARD_RATE,
    type CommunityEndpointRuntime,
} from "@shared/community-endpoints.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import type { ErrorVariables } from "@shared/error.ts";
import {
    getDefaultErrorMessage,
    getErrorCode,
    UpstreamError,
} from "@shared/error.ts";
import { sendToTinybird } from "@shared/events.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    type CostDefinition,
    calculateCostWithDefinition,
    calculatePriceWithDefinition,
    getPriceDefinitionForModel,
    type ModelDefinition,
    type PriceDefinition,
    type UsageCost,
    type UsagePrice,
} from "@shared/registry/registry.ts";
import {
    FALLBACK_TARGET_HEADER,
    openaiUsageToUsage,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import type {
    EventType,
    GenerationEventContentFilterParams,
    TinybirdEvent as InsertGenerationEvent,
} from "@shared/schemas/generation-event.ts";
import {
    contentFilterResultsToEventParams,
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
    type ContentFilterResult,
    ContentFilterResultSchema,
    ContentFilterSeveritySchema,
} from "@shared/schemas/openai.ts";
import { getRoutePath, removeUnset } from "@shared/util.ts";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import { EventSourceParserStream } from "eventsource-parser/stream";
import type { HonoRequest } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { mergeContentFilterResults } from "@/content-filter.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { FrontendKeyRateLimitVariables } from "@/middleware/rate-limit-durable.ts";
import { generateRandomId, parseBooleanLike } from "@/util.ts";

type ModelVariables = {
    model: {
        requested: string;
        resolved: string;
        definition: ModelDefinition<string>;
        communityEndpoint?: CommunityEndpointRuntime;
    };
};

export type ModelUsage = {
    model: string;
    usage: Usage;
};

type RequestTrackingData = {
    modelRequested: string | null;
    resolvedModelRequested: string;
    modelProvider?: string;
    modelDefinition: ModelDefinition<string>;
    modelCostDefinition: CostDefinition;
    modelPriceDefinition: PriceDefinition;
    streamRequested: boolean;
    referrerData: ReferrerData;
};

type ResponseTrackingData = {
    responseStatus: number;
    responseOk: boolean;
    cacheData: CacheData;
    isBilledUsage: boolean;
    fallbackUsed: boolean;
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
        BalanceVariables &
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

        const rawIp = getRealClientIp(c);
        const clientIp =
            rawIp !== "unknown" ? stripIPv4MappedPrefix(rawIp) : undefined;
        const ipSubnet = truncateIpToSubnet(clientIp);

        const apiKeyMetadata = c.var.auth.apiKey?.metadata as
            | Record<string, unknown>
            | undefined;
        const byopClientKeyId = c.var.auth.apiKey?.byopClientKeyId;
        const userTracking: UserData = {
            userId: c.var.auth.user?.id,
            userTier: c.var.auth.user?.tier,
            userGithubId: c.var.auth.user?.githubId
                ? String(c.var.auth.user.githubId)
                : undefined,
            userGithubUsername: c.var.auth.user?.githubUsername ?? undefined,
            apiKeyId: c.var.auth.apiKey?.id,
            apiKeyType: apiKeyMetadata?.keyType as ApiKeyType,
            apiKeyName: c.var.auth.apiKey?.name,
            apiKeyCreatedVia: byopClientKeyId
                ? "redirect-auth"
                : (apiKeyMetadata?.createdVia as string | undefined),
            apiKeyClientId: byopClientKeyId ?? undefined,
            apiKeyCreatedForApp: c.var.auth.apiKey?.byopClientName ?? undefined,
            apiKeyCreatedForUserId:
                c.var.auth.apiKey?.byopClientUserId ?? undefined,
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

                // Capture balance tracking AFTER next() so balanceCheckResult is set
                const balanceTracking = {
                    selectedMeterId:
                        c.var.balance.balanceCheckResult?.selectedMeterId,
                    selectedMeterSlug:
                        c.var.balance.balanceCheckResult?.selectedMeterSlug,
                    balances: c.var.balance.balanceCheckResult?.balances || {},
                } satisfies BalanceData;

                const ipHash = await hashIp(clientIp, c.env.BETTER_AUTH_SECRET);

                // Deduct payer + credit dev before emitting the event so billing
                // telemetry reflects the committed ledger state.
                const balanceDb = db as unknown as Parameters<
                    typeof handleBalanceDeduction
                >[0]["db"];
                let markup: MarkupResolution | null = null;
                let payerBucket: Awaited<
                    ReturnType<typeof handleBalanceDeduction>
                >["payerBucket"] = null;
                let communityModelReward: CommunityModelRewardResolution | null =
                    null;
                let billedPrice = 0;
                let shouldRunAutoTopUp = false;
                try {
                    const communityEndpoint = c.var.model?.communityEndpoint;
                    const deduction = await handleBalanceDeduction({
                        db: balanceDb,
                        isBilledUsage: responseTracking.isBilledUsage,
                        totalPrice: responseTracking.price?.totalPrice,
                        userId: userTracking.userId,
                        apiKeyId: c.var.auth?.apiKey?.id,
                        apiKeyPollenBalance: c.var.auth?.apiKey?.pollenBalance,
                        byopClientKeyId,
                        modelPaidOnly: c.var.model?.definition.paidOnly,
                        communityModelReward: communityEndpoint
                            ? {
                                  userId: communityEndpoint.ownerUserId,
                                  rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                              }
                            : null,
                    });
                    markup = deduction.markup;
                    communityModelReward = deduction.communityModelReward;
                    payerBucket = deduction.payerBucket;
                    billedPrice = deduction.billedPrice;
                    const totalPrice = responseTracking.price?.totalPrice ?? 0;
                    if (
                        totalPrice > 0 &&
                        payerBucket === "pack" &&
                        deduction.postDeductionPackBalance != null &&
                        deduction.postDeductionPackBalance <=
                            AUTO_TOP_UP_THRESHOLD_POLLEN &&
                        userTracking.userId &&
                        (await isAutoTopUpConfigured(db, userTracking.userId))
                    ) {
                        shouldRunAutoTopUp = true;
                    }
                } catch (error) {
                    log.error(
                        "Billing deduction failed after response; continuing tracking: {error}",
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    );
                }
                const committedBalanceTracking = payerBucket
                    ? {
                          ...balanceTracking,
                          ...payerBucketToMeter(payerBucket),
                      }
                    : balanceTracking;

                const finalEvent = createTrackingEvent({
                    id: generateRandomId(),
                    requestId: c.get("requestId"),
                    requestPath: getRoutePath(c),
                    startTime,
                    endTime,
                    environment: c.env.ENVIRONMENT,
                    eventType,
                    ipSubnet,
                    ipHash,
                    userTracking,
                    balanceTracking: committedBalanceTracking,
                    requestTracking,
                    responseTracking,
                    markup,
                    communityModelReward,
                    billedPrice,
                    errorTracking: collectErrorData(response, c.get("error")),
                });

                await c.var.frontendKeyRateLimit?.consumePollen(
                    responseTracking.price?.totalPrice || 0,
                );

                log.trace(
                    [
                        "Tracking event:",
                        "  isBilledUsage={event.isBilledUsage}",
                        "  balances[v1:meter:tier]={event.balances[v1:meter:tier]}",
                        "  balances[v1:meter:pack]={event.balances[v1:meter:pack]}",
                        '  selectedMeterSlug="{event.selectedMeterSlug}"',
                        "  totalCost={event.totalCost}",
                        "  totalPrice={event.totalPrice}",
                        "  devPrice={event.devPrice}",
                        "  communityModelRewardRate={event.communityModelRewardRate}",
                        "  communityModelRewardAmount={event.communityModelRewardAmount}",
                    ].join("\n"),
                    { event: finalEvent },
                );

                await sendToTinybird(
                    finalEvent,
                    c.env.TINYBIRD_INGEST_URL,
                    c.env.TINYBIRD_INGEST_TOKEN,
                    log,
                );

                if (shouldRunAutoTopUp && userTracking.userId) {
                    await triggerAutoTopUp(c.env, userTracking.userId, log);
                }
            })(),
        );
    });

async function isAutoTopUpConfigured(
    db: DrizzleD1Database,
    userId: string,
): Promise<boolean> {
    const [user] = await db
        .select({
            enabled: userTable.autoTopUpEnabled,
            amountUsd: userTable.autoTopUpAmountUsd,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    if (!user?.enabled || user.amountUsd == null) {
        return false;
    }

    return true;
}

async function triggerAutoTopUp(
    env: CloudflareBindings,
    userId: string,
    log: ReturnType<typeof getLogger>,
): Promise<void> {
    try {
        const response = await env.ENTER.fetch(
            `${PUBLIC_URLS.enter.production}/api/stripe/auto-top-up/trigger`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userId,
                    environment: env.ENVIRONMENT,
                }),
            },
        );

        if (!response.ok) {
            log.warn("Auto top-up trigger failed for user {userId}", {
                userId,
                status: response.status,
            });
        }
    } catch (error) {
        log.warn("Auto top-up trigger errored for user {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function trackRequest(
    modelInfo: ModelVariables["model"],
    request: HonoRequest,
): Promise<RequestTrackingData> {
    // Model is already resolved by the resolveModel middleware
    const modelRequested = modelInfo.requested;
    const resolvedModelRequested = modelInfo.resolved;

    const modelDefinition = modelInfo.definition;
    const modelProvider = modelDefinition.provider;
    const modelCostDefinition = modelDefinition.cost;
    const modelPriceDefinition = getPriceDefinitionForModel(modelDefinition);
    if (!modelCostDefinition || !modelPriceDefinition) {
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
        modelDefinition,
        modelCostDefinition,
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
    const fallbackUsed = parseFallbackUsed(response);
    const notBilled = (
        extra?: Partial<ResponseTrackingData>,
    ): ResponseTrackingData => ({
        responseOk: response.ok,
        responseStatus: response.status,
        cacheData: cacheInfo,
        isBilledUsage: false,
        fallbackUsed,
        ...extra,
    });

    if (!response.ok || cacheInfo.cacheHit) {
        return notBilled();
    }

    // Verify the response content-type matches the expected output before
    // billing. Don't bill (or attempt usage extraction) when upstream returns
    // an unexpected content-type — e.g. a JSON/text error body with HTTP 200,
    // or JSON for a stream: true request.
    const contentType = response.headers.get("content-type") || "";
    const contentTypeGuard = getContentTypeGuard(eventType, requestTracking);
    if (contentTypeGuard && !contentTypeGuard.isExpected(contentType)) {
        log.warn(
            "Unexpected content-type for billing: {contentType} for model {model} (kind={kind})",
            {
                contentType,
                model: resolvedModelRequested,
                kind: contentTypeGuard.kind,
            },
        );
        return notBilled();
    }

    const { modelUsage, contentFilterResults } =
        await extractUsageAndContentFilterResults(
            eventType,
            requestTracking,
            response,
        );
    if (!modelUsage) {
        log.error("Failed to extract model usage for model {model}", {
            model: resolvedModelRequested,
        });
        return notBilled({ contentFilterResults });
    }
    const cost = calculateCostWithDefinition(
        resolvedModelRequested,
        modelUsage.usage,
        requestTracking.modelCostDefinition,
    );
    const price = calculatePriceWithDefinition(
        resolvedModelRequested,
        modelUsage.usage,
        requestTracking.modelPriceDefinition,
    );
    return {
        responseOk: response.ok,
        responseStatus: response.status,
        cacheData: cacheInfo,
        isBilledUsage: true,
        fallbackUsed,
        cost,
        price,
        modelUsed: modelUsage.model,
        usage: modelUsage.usage,
        contentFilterResults,
    };
}

// Portkey reports the served target as "config.targets[N]" via the
// x-fallback-target header (re-emitted from x-portkey-last-used-option-index).
// A fallback fired whenever the served target is not the primary (index 0).
function parseFallbackUsed(response: Response): boolean {
    const target = response.headers.get(FALLBACK_TARGET_HEADER);
    if (!target) return false;
    const match = target.match(/\[(\d+)\]/);
    return match ? Number(match[1]) > 0 : false;
}

// Resolve the per-event content-type expectation for billing. Returns null
// when the event type (or stream mode) has no content-type guard, so the
// caller skips the check entirely. Preserves the per-branch rules: image/video
// uses startsWith; text-stream only guards when a stream was requested and uses
// includes; audio allows audio/* (TTS) or application/json for STT models.
function getContentTypeGuard(
    eventType: EventType,
    requestTracking: RequestTrackingData,
): { kind: string; isExpected: (contentType: string) => boolean } | null {
    if (eventType === "generate.image") {
        return {
            kind: "image",
            isExpected: (contentType) =>
                contentType.startsWith("image/") ||
                contentType.startsWith("video/") ||
                // 3D models (model/gltf-binary, model/ply, ...) share this
                // EventType with image/video.
                contentType.startsWith("model/"),
        };
    }
    if (eventType === "generate.text" && requestTracking.streamRequested) {
        return {
            kind: "text-stream",
            isExpected: (contentType) =>
                contentType.includes("text/event-stream"),
        };
    }
    if (eventType === "generate.audio") {
        const isSTTModel =
            requestTracking.modelDefinition.outputModalities?.[0] === "text";
        return {
            kind: "audio",
            isExpected: (contentType) =>
                contentType.startsWith("audio/") ||
                (isSTTModel && contentType.startsWith("application/json")),
        };
    }
    return null;
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
    apiKeyCreatedVia?: string;
    apiKeyCreatedForApp?: string;
    apiKeyCreatedForUserId?: string;
    apiKeyClientId?: string;
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
    ipSubnet?: string;
    ipHash?: string;
    userTracking: UserData;
    balanceTracking: BalanceData;
    requestTracking: RequestTrackingData;
    responseTracking: ResponseTrackingData;
    markup: MarkupResolution | null;
    communityModelReward: CommunityModelRewardResolution | null;
    billedPrice: number;
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
    ipSubnet,
    ipHash,
    userTracking,
    balanceTracking,
    requestTracking,
    responseTracking,
    markup,
    communityModelReward,
    billedPrice,
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
        ipSubnet,
        ipHash,

        ...userTracking,
        ...requestTracking.referrerData,
        ...responseTracking.cacheData,

        modelRequested: requestTracking.modelRequested,
        resolvedModelRequested: requestTracking.resolvedModelRequested,
        modelUsed: responseTracking.modelUsed,
        modelProviderUsed: requestTracking.modelProvider,
        fallbackUsed: responseTracking.fallbackUsed,

        isBilledUsage: responseTracking.isBilledUsage,

        ...balanceTracking,

        ...priceToEventParams(requestTracking.modelPriceDefinition),
        ...usageToEventParams(responseTracking.usage),

        totalCost: responseTracking.cost?.totalCost || 0,
        totalPrice: billedPrice,
        devPrice: responseTracking.price?.totalPrice || 0,
        markupRate: markup?.markupRate ?? 0,
        communityModelRewardUserId: communityModelReward?.userId,
        communityModelRewardRate: communityModelReward?.rewardRate ?? 0,
        communityModelRewardAmount: communityModelReward?.credit ?? 0,

        ...responseTracking.contentFilterResults,
        ...errorTracking,
    };
}

async function extractStreamRequested(request: HonoRequest): Promise<boolean> {
    if (request.method === "GET") {
        // "stream" is a query param, not a route param.
        return parseBooleanLike(request.query("stream")) ?? false;
    }
    if (request.method === "POST") {
        const contentType = request.header("content-type") || "";
        // Skip JSON parsing for multipart requests (e.g., audio transcription)
        if (contentType.includes("multipart/form-data")) {
            return false;
        }
        try {
            const stream = (
                request.valid("json" as never) as
                    | { stream?: unknown }
                    | undefined
            )?.stream;
            if (stream !== undefined) {
                return parseBooleanLike(stream) ?? false;
            }
        } catch {
            // Fall back to parsing a cloned raw body for routes without JSON validation.
        }
        try {
            const stream = (
                (await request.raw.clone().json()) as { stream?: unknown }
            ).stream;
            return parseBooleanLike(stream) ?? false;
        } catch {
            return false;
        }
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
        model: modelUsed,
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
            model,
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
    const contentType = response.headers.get("content-type") || "";
    if (
        eventType === "generate.text" &&
        requestTracking.streamRequested &&
        response.body instanceof ReadableStream &&
        contentType.includes("text/event-stream")
    ) {
        const eventStream = extractResponseStream(response);
        return await extractUsageAndContentFilterResultsStream(eventStream);
    }
    return extractUsageAndContentFilterResultsHeaders(response);
}

type CacheData = {
    cacheHit: boolean;
    cacheKey?: string;
};

function extractCacheHeaders(response: Response): CacheData {
    return {
        cacheHit: response.headers.get("x-cache") === "HIT",
        cacheKey: response.headers.get("x-cache-key") || undefined,
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

// Boolean moderation flags arrive as header strings ("true"/"false" via
// String(value) in contentFilterResultsToHeaders), so parse them back here.
const HeaderBooleanSchema = z
    .enum(["true", "false"])
    .transform((value) => value === "true");

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
            HeaderBooleanSchema.optional().catch(undefined),
        "x-moderation-completion-hate-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-self-harm-severity":
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-sexual-severity": 
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-violence-severity":
            ContentFilterSeveritySchema.optional().catch(undefined),
        "x-moderation-completion-protected-material-text-detected": 
            HeaderBooleanSchema.optional().catch(undefined),
        "x-moderation-completion-protected-material-code-detected": 
            HeaderBooleanSchema.optional().catch(undefined),
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

export function collectErrorData(response: Response, error?: Error): ErrorData {
    if (response.ok && !error) return {};
    let source: string | undefined;
    let explicitCode: string | undefined;
    if (error instanceof UpstreamError) {
        source = error.requestUrl?.hostname;
        explicitCode = error.errorCode;
    }
    // Note: errorStack and errorDetails removed to reduce D1 memory usage
    // Stack traces and details are still logged but not stored in the database
    return {
        // Prefer the error's explicit code (e.g. content_policy_violation) so
        // analytics can distinguish it from a generic status-derived code.
        errorResponseCode: explicitCode ?? getErrorCode(response.status),
        errorSource: source,
        errorMessage: error?.message || getDefaultErrorMessage(response.status),
    };
}
