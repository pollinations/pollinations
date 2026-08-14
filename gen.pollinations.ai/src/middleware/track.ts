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
import { COMMUNITY_MODEL_REWARD_RATE } from "@shared/community-endpoints.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import type { ErrorVariables } from "@shared/error.ts";
import {
    getDefaultErrorMessage,
    getErrorCode,
    remapUpstreamStatus,
    UpstreamError,
} from "@shared/error.ts";
import { sendToTinybird } from "@shared/events.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
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
import type { ModelVariables } from "@/middleware/model.ts";
import type { FrontendKeyRateLimitVariables } from "@/middleware/rate-limit-durable.ts";
import { generateRandomId, parseBooleanLike } from "@/util.ts";
import type { FailedCall } from "../fallback.ts";

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
        overrideResponseTracking: (response: Response) => void;
        // Service layers register normalized request facts that affect
        // pricing. Consumed once at billing time by selectCostVariant.
        setPricingInput: (input: PricingInput) => void;
        /**
         * Handed to the fallback loop to append to. Nothing is written as the
         * calls fail: the block after next() owns every row this request
         * emits, so it can see the whole sequence at once.
         */
        failedCalls: FailedCall[];
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

        let responseOverride: Response | null = null;
        let pricingInput: PricingInput | undefined;
        /**
         * Every upstream call that failed, in the order they were tried.
         *
         * Filled by the fallback loop, which knows only how to retry; this
         * middleware is what turns the list into rows.
         */
        const failedCalls: FailedCall[] = [];

        // Read at emit time: balanceCheckResult is only set once the balance
        // middleware has run.
        const balanceTracking = (): BalanceData => ({
            selectedMeterId: c.var.balance.balanceCheckResult?.selectedMeterId,
            selectedMeterSlug:
                c.var.balance.balanceCheckResult?.selectedMeterSlug,
            balances: c.var.balance.balanceCheckResult?.balances || {},
        });

        /**
         * The one place a generation row is built and sent.
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
            markup?: MarkupResolution | null;
            communityModelReward?: CommunityModelRewardResolution | null;
            billedPrice?: number;
        }): Promise<InsertGenerationEvent> => {
            const event = createTrackingEvent({
                id: generateRandomId(),
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
                errorTracking: row.errorTracking,
                markup: row.markup ?? null,
                communityModelReward: row.communityModelReward ?? null,
                billedPrice: row.billedPrice ?? 0,
            });
            await sendToTinybird(
                event,
                c.env.TINYBIRD_INGEST_URL,
                c.env.TINYBIRD_INGEST_TOKEN,
                log,
            );
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
            failedCalls,
        });

        await next();

        c.executionCtx.waitUntil(
            (async () => {
                const userId = userTracking.userId;
                if (!userId) return;

                const terminalAttempt = failedCalls.find(
                    (call) => call.terminal,
                );
                const terminalAttemptModel = terminalAttempt?.candidate.id;

                // Routes attach telemetry headers (x-moderation-*, cache
                // status) to the final response AFTER the override is
                // captured, so read the body from the override but headers
                // from c.res — keeping the override's content-type since it
                // describes the body that usage extraction parses.
                const response = responseOverride
                    ? withFinalResponseHeaders(responseOverride, c.res)
                    : responseForTracking(c.res);
                // What a rescue changes: the generation's cost, and which owner
                // earns the reward. Not the price — the caller is charged the
                // listing they asked for either way.
                // Emitted only after the response above is captured: any
                // await before that clone lets the body start streaming, and
                // cloning a locked stream throws.
                // One row per call that was moved on from. The failure that
                // ended the request is not among them: it is the response, and
                // the settlement row below carries it — under the name only the
                // loop can supply. So a request emits one row per upstream call.
                for (const call of failedCalls) {
                    if (call.terminal) continue;
                    const model = call.candidate.id;
                    const status = failedAttemptStatus(call.error);
                    await emitRow({
                        startTime: call.startedAt,
                        endTime: call.endedAt,
                        balanceTracking: balanceTracking(),
                        responseTracking: {
                            responseStatus: status,
                            cacheHit: false,
                            isBilledUsage: false,
                            isFinal: false,
                            fallbackUsed:
                                model !==
                                requestTracking.resolvedModelRequested,
                            modelUsed: model,
                            modelProviderUsed:
                                call.candidate.definition?.provider ??
                                requestTracking.modelProvider,
                        },
                        errorTracking: collectErrorData(
                            status,
                            call.error instanceof Error
                                ? call.error
                                : undefined,
                        ),
                    });
                }
                const servedEntry = c.var.servedModelEntry;
                const responseTracking = await trackResponse(
                    eventType,
                    requestTracking,
                    response,
                    servedEntry?.definition ??
                        terminalAttempt?.candidate.definition,
                    terminalAttemptModel ?? servedEntry?.id,
                    pricingInput,
                );
                if (responseTracking.cacheHit) {
                    await c.var.frontendKeyRateLimit?.consumePollen(0);
                    return;
                }
                // trackResponse consumes SSE text and JSON bodies, so for
                // those endTime marks actual response completion — not
                // time-to-first-byte. Binary bodies (image/audio) are never
                // read by tracking, so their endTime stays ~header arrival.
                const endTime = new Date();

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
                    const communityEndpoint = servedEntry
                        ? servedEntry.communityEndpoint
                        : c.var.model?.communityEndpoint;
                    const deduction = await handleBalanceDeduction({
                        db: balanceDb,
                        isBilledUsage: responseTracking.isBilledUsage,
                        totalPrice: responseTracking.price?.totalPrice,
                        userId,
                        apiKeyId: c.var.auth?.apiKey?.id,
                        apiKeyPollenBalance: c.var.auth?.apiKey?.pollenBalance,
                        byopClientKeyId,
                        modelPaidOnly: c.var.model?.definition.paidOnly,
                        // Only public endpoints pay their owner a reward: a
                        // private endpoint is owner-called (base cost billed to
                        // the owner, no markup, no self-credit).
                        communityModelReward:
                            communityEndpoint?.visibility === "public"
                                ? {
                                      userId: communityEndpoint.ownerUserId,
                                      rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                                      // Their own listing, not the one the
                                      // caller bought — see basePrice.
                                      basePrice: responseTracking.servedPrice,
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
                        (await isAutoTopUpConfigured(db, userId))
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
                          ...balanceTracking(),
                          ...payerBucketToMeter(payerBucket),
                      }
                    : balanceTracking();

                await c.var.frontendKeyRateLimit?.consumePollen(
                    responseTracking.price?.totalPrice || 0,
                );

                const finalEvent = await emitRow({
                    startTime,
                    endTime,
                    balanceTracking: committedBalanceTracking,
                    responseTracking,
                    markup,
                    communityModelReward,
                    billedPrice,
                    errorTracking:
                        responseTracking.errorTracking ??
                        collectErrorData(response.status, c.get("error")),
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
                        "  devPrice={event.devPrice}",
                        "  communityModelRewardRate={event.communityModelRewardRate}",
                        "  communityModelRewardAmount={event.communityModelRewardAmount}",
                    ].join("\n"),
                    { event: finalEvent },
                );

                if (shouldRunAutoTopUp) {
                    await triggerAutoTopUp(c.env, userId, log);
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
    servedModelDefinition?: ModelDefinition,
    terminalAttemptModel?: string,
    pricingInput?: PricingInput,
): Promise<ResponseTrackingData> {
    const log = getLogger(["hono", "track", "response"]);
    const { resolvedModelRequested } = requestTracking;
    // The model this row is actually about. Defaults to the one asked for,
    // which is right until a fallback moves the request to a different id.
    const modelCalled = terminalAttemptModel ?? resolvedModelRequested;
    const modelProviderUsed =
        servedModelDefinition?.provider ?? requestTracking.modelProvider;
    const cacheHit = response.headers.get("x-cache") === "HIT";
    const fallbackUsed = parseFallbackUsed(response);
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
    // it. Portkey's multi-target config (see fallbackUsed /
    // x-portkey-last-used-option-index) only changes which upstream provider
    // target served a single model id, so it needs no such reporting.
    if (cacheHit) {
        return notBilled();
    }
    if (!response.ok) {
        return notBilled({
            modelUsed: modelCalled,
            fallbackUsed:
                fallbackUsed || modelCalled !== resolvedModelRequested,
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
            servedBy: servedModelDefinition ?? requestTracking.modelDefinition,
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
        servedBy: servedModelDefinition ?? requestTracking.modelDefinition,
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
