import { getLogger } from "@logtape/logtape";
import type { ApiKeyType } from "@shared/auth/api-key-creation.ts";
import {
    type CommunityModelRewardInput,
    type CommunityModelRewardResolution,
    type MarkupResolution,
    selectCommunityModelReward,
} from "@shared/billing/track-helpers.ts";
import {
    getRealClientIp,
    hashIp,
    stripIPv4MappedPrefix,
    truncateIpToSubnet,
} from "@shared/client-ip.ts";
import type { ErrorVariables } from "@shared/error.ts";
import {
    getDefaultErrorMessage,
    getErrorCode,
    remapUpstreamStatus,
    UpstreamError,
} from "@shared/error.ts";
import {
    type BillingAdjustment,
    type CostDefinition,
    calculateUsageBilling,
    getPriceDefinitionForModel,
    type ModelDefinition,
    type PriceDefinition,
    type PricingInput,
    type Usage,
    type UsageCost,
    type UsagePrice,
} from "@shared/registry/registry.ts";
import {
    FALLBACK_TARGET_HEADER,
    MODEL_USED_HEADER,
    openaiUsageToUsage,
    parseUsageHeaders,
    USAGE_MISSING_HEADER,
} from "@shared/registry/usage-headers.ts";
import type {
    BillableEvent,
    BillingSettlementResponse,
} from "@shared/schemas/billable-event.ts";
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
import { EventSourceParserStream } from "eventsource-parser/stream";
import type { HonoRequest } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { mergeContentFilterResults } from "@/content-filter.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import {
    type GenerationCacheVariables,
    hashGenerationCacheIdentity,
} from "@/middleware/generation-cache.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import type { FrontendKeyRateLimitVariables } from "@/middleware/rate-limit-durable.ts";
import { generateRandomId, parseBooleanLike } from "@/util.ts";
import { cancelGenerationAuthorization } from "@/utils/generation-access.ts";
import {
    type FallbackAttempt,
    type FallbackCandidate,
    fallbackCandidates,
} from "../fallback.ts";

export type ModelUsage = {
    model: string;
    usage: Usage;
    output?: unknown;
};

type RequestTrackingData = {
    modelRequested: string | null;
    resolvedModelRequested: string;
    modelProvider?: string;
    modelDefinition: ModelDefinition;
    modelCostDefinition: CostDefinition;
    modelPriceDefinition: PriceDefinition;
    streamRequested: boolean;
    referrerData: ReferrerData;
};

type ResponseTrackingData = {
    responseStatus: number;
    cacheHit: boolean;
    isBilledUsage: boolean;
    fallbackUsed: boolean;
    /** False only on a call that was moved on from; the outcome row leaves it true. */
    isFinal?: boolean;
    modelUsed?: string;
    modelProviderUsed?: string;
    usage?: Usage;
    cost?: UsageCost;
    price?: UsagePrice;
    /** What the serving model charges for this usage; bounds the owner reward. */
    servedPrice?: number;
    // Per-rule provider-cost adjustment breakdown. Absent when no independently
    // knowable provider adjustment was incurred.
    adjustments?: BillingAdjustment[];
    // Effective per-unit price sheet applied at billing time (cost variant
    // merged, multiplier applied). The tracking event records this sheet so
    // recorded rates always reproduce the billed totals.
    priceDefinition?: PriceDefinition;
    // Applied cost variant name (financial identity; modelUsed stays
    // observational).
    costVariant?: string;
    contentFilterResults?: GenerationEventContentFilterParams;
    // A failure the response status cannot show. Replaces the status-derived
    // error data when the settlement row is emitted.
    errorTracking?: ErrorData;
};

export type TrackVariables = {
    track: {
        modelRequested: string | null;
        resolvedModelRequested: string;
        streamRequested: boolean;
        detachedExecutionTracked?: boolean;
        overrideResponseTracking: (response: Response) => void;
        // Service layers register normalized request facts that affect
        // pricing. Consumed once at billing time by selectCostVariant.
        setPricingInput: (input: PricingInput) => void;
        /** Ordered upstream calls; one is marked when it settles the request. */
        attempts: FallbackAttempt[];
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
        ModelVariables &
        GenerationCacheVariables;
};

export const track = (eventType: EventType) =>
    createMiddleware<TrackEnv>(async (c, next) => {
        const log = getLogger(["hono", "track"]);
        const startTime = new Date();

        // Get model from resolveModel middleware
        const modelInfo = c.var.model;
        const requestTracking = await trackRequest(modelInfo, c.req);

        const rawIp = getRealClientIp(c);
        const clientIp =
            rawIp !== "unknown" ? stripIPv4MappedPrefix(rawIp) : undefined;
        const ipSubnet = truncateIpToSubnet(clientIp);

        const userTracking = requestIdentity(c.var.auth);

        let responseOverride: Response | null = null;
        let pricingInput: PricingInput | undefined;
        /** Filled by the fallback loop; this middleware turns it into rows. */
        const attempts: FallbackAttempt[] = [];

        // Read at emit time: balanceCheckResult is only set once the balance
        // middleware has run.
        const balanceTracking = (): BalanceData => ({
            selectedMeterId: c.var.balance.balanceCheckResult?.selectedMeterId,
            selectedMeterSlug:
                c.var.balance.balanceCheckResult?.selectedMeterSlug,
            balances: c.var.balance.balanceCheckResult?.balances || {},
        });
        let cacheKeyPromise: Promise<string | undefined> | undefined;
        const cacheKeyForTracking = () => {
            if (!cacheKeyPromise) {
                const cache = c.var.generationCache;
                cacheKeyPromise = cache
                    ? hashGenerationCacheIdentity(
                          cache.adapter.storage,
                          cache.key,
                      )
                    : Promise.resolve(undefined);
            }
            return cacheKeyPromise;
        };
        const billableEvents: BillableEvent[] = [];

        /**
         * The one place a generation row is built for Enter settlement.
         *
         * Everything that identifies the request is captured here; callers pass
         * only what differs between a call that failed and the call that
         * settled.
         */
        const emitRow = async (row: {
            startTime: Date;
            endTime: Date;
            balanceTracking: BalanceData;
            responseTracking: ResponseTrackingData;
            errorTracking: ErrorData;
            price?: number;
            communityReward?: CommunityModelRewardInput | null;
        }): Promise<InsertGenerationEvent> => {
            const id = generateRandomId();
            const event = createTrackingEvent({
                id,
                requestId: c.get("requestId"),
                requestPath: getRoutePath(c),
                environment: c.env.ENVIRONMENT,
                eventType,
                ipSubnet,
                ipHash: await hashIp(clientIp, c.env.BETTER_AUTH_SECRET),
                userTracking,
                requestTracking,
                startTime: row.startTime,
                endTime: row.endTime,
                balanceTracking: row.balanceTracking,
                responseTracking: row.responseTracking,
                cacheKey: await cacheKeyForTracking(),
                errorTracking: row.errorTracking,
                markup: null,
                communityModelReward: null,
                billedPrice: 0,
            });
            billableEvents.push({
                id,
                requestId: c.get("requestId"),
                meter: eventType,
                price: row.price ?? 0,
                paidOnly: c.var.model.definition.paidOnly ?? false,
                occurredAt: row.endTime.getTime(),
                ...(row.communityReward && {
                    communityReward: row.communityReward,
                }),
                telemetry: JSON.parse(
                    JSON.stringify(event),
                ) as BillableEvent["telemetry"],
            });
            return event;
        };

        c.set("track", {
            modelRequested: requestTracking.modelRequested,
            resolvedModelRequested: requestTracking.resolvedModelRequested,
            streamRequested: requestTracking.streamRequested,
            overrideResponseTracking: (response: Response) => {
                responseOverride = response;
            },
            setPricingInput: (input: PricingInput) => {
                pricingInput = input;
            },
            attempts,
        });

        await next();

        // Detached execution already tracked the provider failure. The outer
        // caller only receives that captured result and must not emit it again.
        if (c.var.track.detachedExecutionTracked) return;

        const settlement = (async () => {
            if (!userTracking.userId) {
                return;
            }

            const finalCandidate =
                attempts.find((attempt) => attempt.settled)?.candidate ??
                fallbackCandidates(modelInfo)[0];

            // Capture the body before the response stream locks. Failed
            // fallback calls and the final call are settled in one batch.
            const response = responseOverride
                ? withFinalResponseHeaders(responseOverride, c.res)
                : responseForTracking(c.res);
            for (const attempt of attempts) {
                if (attempt.settled) continue;
                const model = attempt.candidate.id;
                const status = failedAttemptStatus(attempt.error);
                await emitRow({
                    startTime: attempt.startedAt,
                    endTime: attempt.endedAt,
                    balanceTracking: balanceTracking(),
                    responseTracking: {
                        responseStatus: status,
                        cacheHit: false,
                        isBilledUsage: false,
                        isFinal: false,
                        fallbackUsed:
                            model !== requestTracking.resolvedModelRequested,
                        modelUsed: model,
                        modelProviderUsed:
                            attempt.candidate.definition?.provider ??
                            requestTracking.modelProvider,
                    },
                    errorTracking: collectErrorData(
                        status,
                        attempt.error instanceof Error
                            ? attempt.error
                            : undefined,
                    ),
                });
            }

            const responseTracking = await trackResponse(
                eventType,
                requestTracking,
                response,
                finalCandidate,
                pricingInput,
            );
            if (responseTracking.cacheHit) {
                await cancelGenerationAuthorization(c.var, c.env);
                await c.var.frontendKeyRateLimit?.consumePollen(0);
                return;
            }

            const endTime = new Date();
            const communityReward = selectCommunityModelReward(
                c.var.model?.communityEndpoint,
                finalCandidate.communityEndpoint,
                responseTracking.servedPrice,
            );
            const price = responseTracking.isBilledUsage
                ? (responseTracking.price?.totalPrice ?? 0)
                : 0;
            await c.var.frontendKeyRateLimit?.consumePollen(price);
            const finalEvent = await emitRow({
                startTime,
                endTime,
                balanceTracking: balanceTracking(),
                responseTracking,
                price,
                communityReward,
                errorTracking:
                    responseTracking.errorTracking ??
                    collectErrorData(response.status, c.get("error")),
            });

            const authorizationId = c.var.balance.billingAuthorizationId;
            if (!authorizationId) {
                throw new Error("Generation billing authorization is missing");
            }
            let result: BillingSettlementResponse;
            try {
                result = await c.env.ENTER_BILLING.settle(
                    authorizationId,
                    billableEvents,
                );
            } catch (error) {
                log.warn(
                    "Billing settlement acknowledgement was lost; retrying the same idempotent event batch",
                    { error },
                );
                result = await c.env.ENTER_BILLING.settle(
                    authorizationId,
                    billableEvents,
                );
            }
            if (!result.ok) throw new Error(result.error);
            const rejected = result.events.find(
                (event) =>
                    event.status === "rejected" || event.status === "conflict",
            );
            if (rejected) {
                throw new Error(
                    `Billing event ${rejected.id} was ${rejected.status}`,
                );
            }
            c.var.balance.billingAuthorizationId = undefined;

            log.trace("Generation billing batch settled: {eventCount} events", {
                eventCount: billableEvents.length,
                event: finalEvent,
            });
        })().catch(async (error) => {
            await cancelGenerationAuthorization(c.var, c.env);
            throw error;
        });

        // Streaming must return headers immediately; waitUntil keeps its
        // settlement alive. Non-streaming work is not complete until Enter has
        // atomically accepted the event batch.
        if (requestTracking.streamRequested) {
            c.executionCtx.waitUntil(settlement);
        } else {
            // Detached cache capture sits outside this middleware, so a
            // rejected settlement becomes a 500 before any cache write starts.
            await settlement;
        }
    });

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

// Tracking overrides capture the upstream body before route handlers attach
// telemetry headers to the final response. Combine the override body with the
// final headers so header-based extraction (moderation, cache) stays intact.
function withFinalResponseHeaders(
    override: Response,
    final: Response,
): Response {
    const headers = new Headers(final.headers);
    const contentType = override.headers.get("content-type");
    if (contentType) {
        headers.set("content-type", contentType);
    }
    return new Response(override.body, {
        status: override.status,
        headers,
    });
}

/** Avoid cloning binary streams that tracking never reads. */
function responseForTracking(response: Response): Response {
    const contentType = response.headers.get("content-type") || "";
    const readsBody =
        contentType.includes("text/event-stream") ||
        contentType.includes("application/json");
    return readsBody ? response.clone() : new Response(null, response);
}

export async function trackResponse(
    eventType: EventType,
    requestTracking: RequestTrackingData,
    response: Response,
    candidate: FallbackCandidate,
    pricingInput?: PricingInput,
): Promise<ResponseTrackingData> {
    const log = getLogger(["hono", "track", "response"]);
    const { resolvedModelRequested } = requestTracking;
    const modelCalled = candidate.id || resolvedModelRequested;
    const modelProviderUsed =
        candidate.definition?.provider ?? requestTracking.modelProvider;
    const cacheHit = response.headers.get("x-cache") === "HIT";
    const fallbackUsed =
        modelCalled !== resolvedModelRequested || parseFallbackUsed(response);
    const notBilled = (
        extra?: Partial<ResponseTrackingData>,
    ): ResponseTrackingData => ({
        responseStatus: response.status,
        cacheHit,
        isBilledUsage: false,
        fallbackUsed,
        modelProviderUsed,
        ...extra,
    });

    // A cache hit called no model, so it must not claim one. A failure did
    // call a model, and recording which one is the only way an error row can
    // say what failed — otherwise model_used falls back to the datasource
    // DEFAULT 'undefined' and per-model upstream health is unqueryable.
    //
    // Which model that was: the one the request resolved to, unless the
    // fallback loop moved on and stopped on a different one. Only the loop
    // knows that, so it reports the id it stopped on and modelCalled prefers
    // it.
    if (cacheHit) {
        return notBilled();
    }
    if (!response.ok) {
        return notBilled({
            modelUsed: modelCalled,
        });
    }

    // Verify the response content-type matches the expected output before
    // billing. Don't bill (or attempt usage extraction) when upstream returns
    // an unexpected content-type — e.g. a JSON/text error body with HTTP 200,
    // or JSON for a stream: true request.
    const contentType = response.headers.get("content-type") || "";
    const contentTypeGuard = getContentTypeGuard(
        eventType,
        requestTracking,
        response,
    );
    if (contentTypeGuard && !contentTypeGuard.isExpected(contentType)) {
        log.warn(
            "Unexpected content-type for billing: {contentType} for model {model} (kind={kind})",
            {
                contentType,
                model: resolvedModelRequested,
                kind: contentTypeGuard.kind,
            },
        );
        return notBilled({ modelUsed: resolvedModelRequested });
    }

    const { modelUsage, output, contentFilterResults } =
        await extractUsageAndContentFilterResults(
            eventType,
            requestTracking,
            response,
        );
    const hasFinishReasonError =
        eventType === "generate.text"
            ? containsFinishReasonError(output)
            : false;
    if (hasFinishReasonError) {
        // Keep the proxy response untouched; only billing and health reflect
        // the upstream protocol's explicit terminal failure.
        const usage = modelUsage?.usage ?? {};
        return {
            responseStatus: 502,
            cacheHit,
            isBilledUsage: false,
            fallbackUsed,
            ...calculateUsageBilling({
                model: resolvedModelRequested,
                usage,
                servedBy:
                    candidate.definition ?? requestTracking.modelDefinition,
                quotedBy: requestTracking.modelDefinition,
                output,
                input: pricingInput,
            }),
            modelUsed: modelUsage?.model ?? modelCalled,
            modelProviderUsed,
            usage,
            contentFilterResults,
            errorTracking: {
                errorResponseCode: "upstream_finish_reason_error",
                errorMessage:
                    "Upstream ended generation with finish_reason=error",
            },
        };
    }
    if (!modelUsage) {
        log.error("Failed to extract model usage for model {model}", {
            model: resolvedModelRequested,
        });
        // Missing token usage must never fabricate token charges, but some
        // provider fees are independently knowable from the request/response
        // (for example, Perplexity's flat per-request search fee).
        const adjustmentOnlyBilling = calculateUsageBilling({
            model: resolvedModelRequested,
            usage: {},
            servedBy: candidate.definition ?? requestTracking.modelDefinition,
            quotedBy: requestTracking.modelDefinition,
            output,
            input: pricingInput,
        });
        const hasKnownProviderCost = adjustmentOnlyBilling.cost.totalCost > 0;
        const hasBillablePrice = adjustmentOnlyBilling.price.totalPrice > 0;
        if (hasKnownProviderCost || hasBillablePrice) {
            return {
                responseStatus: response.status,
                cacheHit,
                isBilledUsage: hasBillablePrice,
                fallbackUsed,
                ...adjustmentOnlyBilling,
                modelUsed: modelCalled,
                usage: {},
                contentFilterResults,
            };
        }
        // Nothing was charged and nothing could be. Mark the row so a billable
        // text generation with no charge stays queryable instead of passing
        // for an ordinary unbilled one.
        return notBilled({
            contentFilterResults,
            modelUsed: modelCalled,
            errorTracking:
                eventType === "generate.text"
                    ? {
                          errorResponseCode: "usage_missing",
                          errorMessage: `No usage and no determinable charge for model ${resolvedModelRequested}`,
                      }
                    : undefined,
        });
    }
    // Cost follows the model that ran; price follows the one the caller asked
    // for, so the invoice does not move because a fallback stepped in.
    const {
        cost,
        price,
        adjustments,
        servedPrice,
        priceDefinition,
        costVariant,
    } = calculateUsageBilling({
        model: resolvedModelRequested,
        usage: modelUsage.usage,
        servedBy: candidate.definition ?? requestTracking.modelDefinition,
        quotedBy: requestTracking.modelDefinition,
        output: modelUsage.output,
        input: pricingInput,
    });
    return {
        responseStatus: response.status,
        cacheHit,
        isBilledUsage: true,
        fallbackUsed,
        cost,
        price,
        servedPrice,
        adjustments,
        priceDefinition,
        costVariant,
        modelUsed: modelUsage.model,
        modelProviderUsed,
        usage: modelUsage.usage,
        contentFilterResults,
    };
}

function containsFinishReasonError(output: unknown): boolean {
    if (!output || typeof output !== "object") return false;
    const streamEvents = (output as { streamEvents?: unknown }).streamEvents;
    const events = Array.isArray(streamEvents) ? streamEvents : [output];
    for (const event of events) {
        if (!event || typeof event !== "object") continue;
        const choices = (event as { choices?: unknown }).choices;
        if (!Array.isArray(choices)) continue;
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const finish = choice as { finish_reason?: unknown };
            if (finish.finish_reason !== "error") continue;
            return true;
        }
    }
    return false;
}

// The fallback loop reports the served candidate as "config.targets[N]" via
// x-fallback-target. A fallback fired whenever N is not the primary index 0.
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
// includes; audio allows audio/*, STT JSON, or explicitly marked timestamped
// TTS JSON. STT also supports plain-text subtitle and transcript formats.
function getContentTypeGuard(
    eventType: EventType,
    requestTracking: RequestTrackingData,
    response: Response,
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
        const isTimestampedTts =
            response.headers.get("x-pollinations-response-format") ===
            "audio-with-timestamps";
        return {
            kind: "audio",
            isExpected: (contentType) =>
                contentType.startsWith("audio/") ||
                (isSTTModel &&
                    (contentType.startsWith("application/json") ||
                        contentType.startsWith("text/plain"))) ||
                (isTimestampedTts &&
                    contentType.startsWith("application/json")),
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

        let data: unknown;
        try {
            data = JSON.parse(event.data);
        } catch {
            continue;
        }
        yield data;
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

/**
 * Who made the request, in the shape the event carries it.
 *
 * Every path that emits a generation row builds this the same way, so a new
 * identity column is added here once rather than in each emitter. Realtime
 * settles from a socket rather than a response and so keeps its own event
 * builder; it spreads this verbatim.
 */
export type UserData = {
    userId?: string;
    userTier?: string;
    parentRequestId?: string;
    apiKeyId?: string;
    apiKeyType?: ApiKeyType;
    apiKeyName?: string;
    apiKeyCreatedVia?: string;
    apiKeyCreatedForApp?: string;
    apiKeyCreatedForUserId?: string;
    apiKeyClientId?: string;
};

export function requestIdentity(auth: AuthVariables["auth"]): UserData {
    const apiKeyMetadata = auth.apiKey?.metadata as
        | Record<string, unknown>
        | undefined;
    const byopClientKeyId = auth.apiKey?.byopClientKeyId;
    return {
        userId: auth.user?.id,
        userTier: auth.user?.tier,
        // A verified claim, never a header — the run token is the only channel
        // that crosses the hop.
        parentRequestId: auth.agentRun?.parentRequestId,
        apiKeyId: auth.apiKey?.id,
        apiKeyType: apiKeyMetadata?.keyType as ApiKeyType,
        apiKeyName: auth.apiKey?.name,
        // A BYOP key is created by the redirect flow, whatever its metadata
        // says it was created via.
        apiKeyCreatedVia: byopClientKeyId
            ? "redirect-auth"
            : (apiKeyMetadata?.createdVia as string | undefined),
        apiKeyClientId: byopClientKeyId ?? undefined,
        apiKeyCreatedForApp: auth.apiKey?.byopClientName ?? undefined,
        apiKeyCreatedForUserId: auth.apiKey?.byopClientUserId ?? undefined,
    };
}

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
    cacheKey?: string;
    userTracking: UserData;
    balanceTracking: BalanceData;
    requestTracking: RequestTrackingData;
    responseTracking: ResponseTrackingData;
    markup: MarkupResolution | null;
    communityModelReward: CommunityModelRewardResolution | null;
    billedPrice: number;
    errorTracking?: ErrorData;
};

// Reduce the per-rule adjustment breakdown into the two Map columns the event
// carries (keyed by versioned rule id). Returns undefined for both fields when
// there are no adjustments so removeUnset drops them and ClickHouse's
// DEFAULT map() fills them — a literal {} would serialize on every event.
export function reduceAdjustmentsToEventFields(
    adjustments: BillingAdjustment[] | undefined,
): {
    adjustmentCosts?: Record<string, number>;
    adjustmentUnits?: Record<string, number>;
} {
    if (!adjustments || adjustments.length === 0) return {};
    const adjustmentCosts: Record<string, number> = {};
    const adjustmentUnits: Record<string, number> = {};
    for (const { ruleId, cost, units } of adjustments) {
        // Defensive: sum on the off chance the same rule id appears twice.
        adjustmentCosts[ruleId] = (adjustmentCosts[ruleId] ?? 0) + cost;
        adjustmentUnits[ruleId] = (adjustmentUnits[ruleId] ?? 0) + units;
    }
    return { adjustmentCosts, adjustmentUnits };
}

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
    cacheKey,
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

        ...(cacheKey && {
            cacheHit: responseTracking.cacheHit,
            cacheType: responseTracking.cacheHit ? "EXACT" : "MISS",
            cacheKey,
        }),

        ...userTracking,
        ...requestTracking.referrerData,

        modelRequested: requestTracking.modelRequested,
        resolvedModelRequested: requestTracking.resolvedModelRequested,
        modelUsed: responseTracking.modelUsed,
        modelProviderUsed:
            responseTracking.modelProviderUsed ?? requestTracking.modelProvider,
        costVariant: responseTracking.costVariant,
        fallbackUsed: responseTracking.fallbackUsed,
        isFinal: responseTracking.isFinal ?? true,

        isBilledUsage: responseTracking.isBilledUsage,

        ...balanceTracking,
        ...reduceAdjustmentsToEventFields(responseTracking.adjustments),

        // Billed rows record the effective sheet resolved at billing time
        // (cost variant merged); not-billed rows fall back to the base sheet.
        ...priceToEventParams(
            responseTracking.priceDefinition ??
                requestTracking.modelPriceDefinition,
        ),
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

function extractUsageHeaders(response: Response): ModelUsage | null {
    if (response.headers.get(USAGE_MISSING_HEADER) === "true") {
        return null;
    }
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

async function extractResponseJsonOutput(
    response: Response,
): Promise<unknown | undefined> {
    // Timestamped TTS JSON contains the complete base64 audio. Billing comes
    // from usage headers, and copying that payload into analytics is wasteful.
    if (
        response.headers.get("x-pollinations-response-format") ===
        "audio-with-timestamps"
    ) {
        return undefined;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return undefined;
    try {
        return await response.clone().json();
    } catch {
        return undefined;
    }
}

function extractContentFilterHeaders(
    response: Response,
): GenerationEventContentFilterParams {
    const parseResult = ContentFilterResultHeadersSchema.safeParse(
        Object.fromEntries(response.headers.entries()),
    );
    return parseResult.data || {};
}

async function extractUsageAndContentFilterResultsHeaders(
    response: Response,
): Promise<{
    modelUsage: ModelUsage | null;
    output?: unknown;
    contentFilterResults: GenerationEventContentFilterParams;
}> {
    const modelUsage = extractUsageHeaders(response);
    const output = await extractResponseJsonOutput(response);
    if (modelUsage) {
        modelUsage.output = output;
    }
    return {
        modelUsage,
        output,
        contentFilterResults: extractContentFilterHeaders(response),
    };
}

async function extractUsageAndContentFilterResultsStream(
    events: AsyncIterable<unknown>,
    servedModelId?: string,
): Promise<{
    modelUsage: ModelUsage | null;
    output?: unknown;
    contentFilterResults: GenerationEventContentFilterParams;
}> {
    const log = getLogger(["hono", "track", "stream"]);
    const EventSchema = z.object({
        model: z.string(),
        // Preserve Perplexity's provider-reported request cost for billing
        // rules that inspect the original event.
        usage: CompletionUsageSchema.extend({
            cost: z.unknown().nullish(),
        }).nullish(),
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
    const streamEvents: unknown[] = [];

    for await (const event of events) {
        const parseResult = EventSchema.safeParse(event);
        streamEvents.push(event);

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

    // Our id wins over the name the provider puts in its chunks: for a
    // community endpoint that name is its upstream's, and after a rescue it
    // belongs to a different owner's model than the one that served.
    const servedModel = servedModelId || model;
    if (!servedModel || !usage) {
        log.error("No usage object found in event stream");
        return {
            modelUsage: null,
            output: streamEvents.length > 0 ? { streamEvents } : undefined,
            contentFilterResults,
        };
    }

    const output = streamEvents.length > 0 ? { streamEvents } : undefined;
    return {
        modelUsage: {
            model: servedModel,
            usage: openaiUsageToUsage(usage),
            output,
        },
        output,
        contentFilterResults,
    };
}

async function extractUsageAndContentFilterResults(
    eventType: EventType,
    requestTracking: RequestTrackingData,
    response: Response,
): Promise<{
    modelUsage: ModelUsage | null;
    output?: unknown;
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
        return await extractUsageAndContentFilterResultsStream(
            eventStream,
            response.headers.get(MODEL_USED_HEADER) ?? undefined,
        );
    }
    return await extractUsageAndContentFilterResultsHeaders(response);
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

export function collectErrorData(status: number, error?: Error): ErrorData {
    if (status < 400 && !error) return {};
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
        errorResponseCode: explicitCode ?? getErrorCode(status),
        errorSource: source,
        errorMessage: error?.message || getDefaultErrorMessage(status),
    };
}

/**
 * The status the request would have returned had this failed attempt been the
 * last one, so an attempt row reads like any other error row on the dashboards:
 * upstream 4xx that are our own concern (auth, quota) arrive as 502 on the
 * served path too, and counting them as client errors would hide a model whose
 * every request is rate limited.
 */
function failedAttemptStatus(error: unknown): number {
    const failure = error as
        | { status?: unknown; upstreamStatus?: unknown }
        | null
        | undefined;
    const status = failure?.upstreamStatus ?? failure?.status;
    return typeof status === "number" ? remapUpstreamStatus(status) : 500;
}
