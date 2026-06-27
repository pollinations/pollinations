import type { ApiKeyType } from "@shared/auth/api-key-metadata.ts";
import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import {
    handleBalanceDeduction,
    type MarkupResolution,
} from "@shared/billing/track-helpers.ts";
import {
    bytesToHex,
    getRealClientIp,
    hashIp,
    stripIPv4MappedPrefix,
    truncateIpToSubnet,
} from "@shared/client-ip.ts";
import { sendToTinybird } from "@shared/events.ts";
import { redactCredentialQueryParams } from "@shared/http/redaction.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import {
    calculateCost,
    calculatePrice,
    getModelDefinition,
    getPriceDefinition,
    type Usage,
    type UsageCost,
    type UsagePrice,
    type UsageType,
} from "@shared/registry/registry.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { getRoutePath } from "@shared/util.ts";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import {
    type RealtimeRequestQueryParams,
    RealtimeUsageSchema,
} from "@/schemas/realtime.ts";
import { generateRandomId } from "@/util.ts";
import { checkBalance } from "@/utils/generation-access.ts";

// Azure OpenAI realtime endpoint. The gpt-realtime-2 deployment lives on the
// Sweden Central myceli resource (same resource as the gpt-audio models). The
// realtime WebSocket path mirrors OpenAI's: /openai/v1/realtime?model=<deployment>.
const AZURE_REALTIME_WEBSOCKET_URL =
    "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/v1/realtime";
// Azure deployment name for the realtime model (set when deploying via the
// Azure CLI). Matches DEFAULT_REALTIME_MODEL here, but kept separate because
// Azure deployment names are independent of the public model id.
const AZURE_REALTIME_DEPLOYMENT = "gpt-realtime-2";
const UNSUPPORTED_TRANSCRIPTION_MESSAGE =
    "Realtime input transcription is not supported yet.";
type WebSocketResponse = Response & { webSocket?: WebSocket };
type WebSocketResponseInit = ResponseInit & { webSocket?: WebSocket };
type RealtimeDeduction = Awaited<ReturnType<typeof handleBalanceDeduction>>;
type RealtimeBillingContext = {
    userId: string;
    userTier?: string;
    userGithubId?: string;
    userGithubUsername?: string;
    apiKeyId?: string;
    apiKeyName?: string;
    apiKeyType?: ApiKeyType;
    apiKeyCreatedVia?: string;
    apiKeyCreatedForApp?: string;
    apiKeyCreatedForUserId?: string;
    apiKeyClientId?: string;
    apiKeyPollenBalance?: number | null;
    byopClientKeyId?: string | null;
    requestId: string;
    requestPath: string;
    environment: string;
    referrerUrl?: string;
    referrerDomain?: string;
    ipSubnet?: string;
    ipHash?: string;
    sessionStartTime: Date;
    usage: Usage;
    settlementInFlight: boolean;
    settlementAttempts: number;
    settled: boolean;
    deduction?: RealtimeDeduction;
    rateLimitConsumed: boolean;
};

function requireAllowedModel(c: Context<Env>, model: string): void {
    const allowedModels = c.var.auth.apiKey?.permissions?.models;
    if (allowedModels?.length && !allowedModels.includes(model)) {
        throw new HTTPException(403, {
            message: `Model '${model}' is not allowed for this API key`,
        });
    }
}

async function createSafetyIdentifier(
    userId: string,
    secret: string,
): Promise<string> {
    const data = new TextEncoder().encode(`${secret}:${userId}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

function buildUpstreamUrl(): string {
    const upstreamUrl = new URL(AZURE_REALTIME_WEBSOCKET_URL);
    upstreamUrl.searchParams.set("model", AZURE_REALTIME_DEPLOYMENT);
    return upstreamUrl.toString();
}

async function connectAzureRealtime(
    c: Context<Env>,
    userId: string,
): Promise<WebSocket | Response> {
    const response = (await fetch(buildUpstreamUrl(), {
        headers: {
            "api-key": c.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "OpenAI-Safety-Identifier": await createSafetyIdentifier(
                userId,
                c.env.BETTER_AUTH_SECRET,
            ),
            "Upgrade": "websocket",
        },
    })) as WebSocketResponse;

    const upstreamSocket = response.webSocket;
    if (upstreamSocket) {
        upstreamSocket.binaryType = "arraybuffer";
        upstreamSocket.accept({ allowHalfOpen: true });
        return upstreamSocket;
    }

    return new Response(await response.text(), {
        status: response.status,
        headers: {
            "Content-Type":
                response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "no-store",
        },
    });
}

function isOpen(socket: WebSocket): boolean {
    return socket.readyState === WebSocket.OPEN;
}

function isClosable(socket: WebSocket): boolean {
    return (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN
    );
}

function normalizeCloseCode(code?: number): number | undefined {
    if (!code || code === 1005 || code === 1006 || code === 1015) {
        return undefined;
    }
    if (code < 1000 || code > 4999) return undefined;
    return code;
}

function closeSocket(socket: WebSocket, code?: number, reason?: string): void {
    if (!isClosable(socket)) return;
    const closeCode = normalizeCloseCode(code);
    if (closeCode) {
        socket.close(closeCode, reason);
    } else {
        socket.close();
    }
}

function forwardMessage(
    source: WebSocket,
    target: WebSocket,
    validate?: (data: unknown) => string | null,
    onReject?: () => void,
): void {
    source.addEventListener("message", (event) => {
        const error = validate?.(event.data);
        if (error) {
            closeSocket(source, 1008, error);
            closeSocket(target, 1008, error);
            onReject?.();
            return;
        }
        if (isOpen(target)) target.send(event.data);
    });
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function numeric(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positiveEntries(usage: Usage): Usage {
    return Object.fromEntries(
        Object.entries(usage).filter(([, value]) => value && value > 0),
    ) as Usage;
}

function hasPositiveUsage(usage: Usage): boolean {
    return Object.values(usage).some((value) => value && value > 0);
}

function addUsage(target: Usage, delta: Usage): void {
    for (const [usageType, amount] of Object.entries(delta) as [
        UsageType,
        number,
    ][]) {
        if (!amount || amount <= 0) continue;
        target[usageType] = (target[usageType] ?? 0) + amount;
    }
}

function realtimeUsageToUsage(rawUsage: unknown): Usage {
    const parsed = RealtimeUsageSchema.safeParse(rawUsage);
    if (!parsed.success) return {};
    const usage = parsed.data;
    const inputDetails = usage.input_token_details ?? {};
    const outputDetails = usage.output_token_details ?? {};
    const cachedDetails = inputDetails.cached_tokens_details ?? {};

    const cachedTextTokens = numeric(cachedDetails.text_tokens);
    const cachedAudioTokens = numeric(cachedDetails.audio_tokens);
    const cachedImageTokens = numeric(cachedDetails.image_tokens);
    const cachedTokens =
        numeric(inputDetails.cached_tokens) ||
        cachedTextTokens + cachedAudioTokens + cachedImageTokens;

    const promptAudioTokens = Math.max(
        0,
        numeric(inputDetails.audio_tokens) - cachedAudioTokens,
    );
    const promptImageTokens = Math.max(
        0,
        numeric(inputDetails.image_tokens) - cachedImageTokens,
    );
    const totalInputTokens =
        numeric(usage.input_tokens) ||
        numeric(inputDetails.text_tokens) +
            numeric(inputDetails.audio_tokens) +
            numeric(inputDetails.image_tokens);
    const promptTextTokens = Math.max(
        0,
        totalInputTokens - cachedTokens - promptAudioTokens - promptImageTokens,
    );
    const completionAudioTokens = numeric(outputDetails.audio_tokens);
    const outputTokenTotal = numeric(usage.output_tokens);
    const totalOutputTokens =
        outputTokenTotal ||
        numeric(outputDetails.text_tokens) + completionAudioTokens;
    const completionTextTokens = Math.max(
        numeric(outputDetails.text_tokens),
        totalOutputTokens - completionAudioTokens,
    );

    return positiveEntries({
        promptTextTokens,
        promptCachedTokens: cachedTokens,
        promptAudioTokens,
        promptImageTokens,
        completionTextTokens,
        completionAudioTokens,
    });
}

function extractResponseUsage(eventData: unknown): Usage | null {
    const event = asRecord(eventData);
    if (event.type !== "response.done") return null;
    const response = asRecord(event.response);
    const usage = realtimeUsageToUsage(response.usage);
    return Object.keys(usage).length ? usage : null;
}

function parseEventData(data: unknown): unknown | null {
    if (typeof data !== "string") return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

function validateClientRealtimeEvent(data: unknown): string | null {
    const event = asRecord(parseEventData(data));
    const eventType = event.type;
    if (
        typeof eventType === "string" &&
        (eventType.startsWith("transcription_session.") ||
            isInputAudioTranscriptionEventType(eventType))
    ) {
        return UNSUPPORTED_TRANSCRIPTION_MESSAGE;
    }

    const session = asRecord(event.session);
    if (session.type === "transcription") {
        return UNSUPPORTED_TRANSCRIPTION_MESSAGE;
    }
    if (
        session.input_audio_transcription !== undefined &&
        session.input_audio_transcription !== null
    ) {
        return UNSUPPORTED_TRANSCRIPTION_MESSAGE;
    }
    const audioInput = asRecord(asRecord(session.audio).input);
    if (
        audioInput.transcription !== undefined &&
        audioInput.transcription !== null
    ) {
        return UNSUPPORTED_TRANSCRIPTION_MESSAGE;
    }

    return null;
}

function isInputAudioTranscriptionEventType(type: unknown): type is string {
    return (
        typeof type === "string" &&
        type.startsWith("conversation.item.input_audio_transcription.")
    );
}

function validateUpstreamRealtimeEvent(data: unknown): string | null {
    const event = asRecord(parseEventData(data));
    return isInputAudioTranscriptionEventType(event.type)
        ? UNSUPPORTED_TRANSCRIPTION_MESSAGE
        : null;
}

function extractReferrerHeader(c: Context<Env>): {
    referrerUrl?: string;
    referrerDomain?: string;
} {
    const referrerUrl = c.req.header("referer") || undefined;
    if (!referrerUrl) return {};
    try {
        const url = new URL(referrerUrl);
        return {
            referrerUrl: redactCredentialQueryParams(url),
            referrerDomain: url.hostname,
        };
    } catch {
        return {};
    }
}

function getPostDeductionBalances(
    payerBucket: "tier" | "pack" | null,
    balances: { tierBalance: number; packBalance: number },
) {
    if (!payerBucket) {
        return {};
    }
    return {
        ...payerBucketToMeter(payerBucket),
        balances: {
            "v1:meter:tier": balances.tierBalance,
            "v1:meter:pack": balances.packBalance,
        },
    };
}

function createRealtimeTrackingEvent(args: {
    tracking: RealtimeBillingContext;
    startTime: Date;
    endTime: Date;
    usage: Usage;
    cost: UsageCost;
    price: UsagePrice;
    markup: MarkupResolution | null;
    payerBucket: "tier" | "pack" | null;
    balances: { tierBalance: number; packBalance: number };
}): TinybirdEvent {
    const model = getModelDefinition(DEFAULT_REALTIME_MODEL);
    return {
        id: generateRandomId(),
        requestId: args.tracking.requestId,
        requestPath: args.tracking.requestPath,
        startTime: args.startTime,
        endTime: args.endTime,
        responseTime: args.endTime.getTime() - args.startTime.getTime(),
        responseStatus: 200,
        environment: args.tracking.environment,
        eventType: "generate.realtime",
        ipSubnet: args.tracking.ipSubnet,
        ipHash: args.tracking.ipHash,
        userId: args.tracking.userId,
        userTier: args.tracking.userTier,
        userGithubId: args.tracking.userGithubId,
        userGithubUsername: args.tracking.userGithubUsername,
        apiKeyId: args.tracking.apiKeyId,
        apiKeyName: args.tracking.apiKeyName,
        apiKeyType: args.tracking.apiKeyType,
        apiKeyCreatedVia: args.tracking.apiKeyCreatedVia,
        apiKeyCreatedForApp: args.tracking.apiKeyCreatedForApp,
        apiKeyCreatedForUserId: args.tracking.apiKeyCreatedForUserId,
        apiKeyClientId: args.tracking.apiKeyClientId,
        referrerUrl: args.tracking.referrerUrl,
        referrerDomain: args.tracking.referrerDomain,
        modelRequested: DEFAULT_REALTIME_MODEL,
        resolvedModelRequested: DEFAULT_REALTIME_MODEL,
        modelUsed: DEFAULT_REALTIME_MODEL,
        modelProviderUsed: model.provider,
        isBilledUsage: true,
        ...getPostDeductionBalances(args.payerBucket, args.balances),
        ...priceToEventParams(getPriceDefinition(DEFAULT_REALTIME_MODEL) ?? {}),
        ...usageToEventParams(args.usage),
        totalCost: args.cost.totalCost,
        totalPrice: args.price.totalPrice + (args.markup?.devCredit ?? 0),
        devPrice: args.price.totalPrice,
        markupRate: args.markup?.markupRate ?? 0,
    };
}

async function settleRealtimeSession(
    c: Context<Env>,
    tracking: RealtimeBillingContext,
): Promise<void> {
    if (tracking.settled) return;
    tracking.settlementAttempts += 1;

    const usage = positiveEntries(tracking.usage);
    if (!hasPositiveUsage(usage)) {
        tracking.settled = true;
        return;
    }

    const cost = calculateCost(DEFAULT_REALTIME_MODEL, usage);
    const price = calculatePrice(DEFAULT_REALTIME_MODEL, usage);
    if (price.totalPrice <= 0) {
        tracking.settled = true;
        return;
    }

    const eventEndTime = new Date();
    const db = drizzle(c.env.DB) as unknown as Parameters<
        typeof handleBalanceDeduction
    >[0]["db"];

    tracking.deduction ??= await handleBalanceDeduction({
        db,
        isBilledUsage: true,
        totalPrice: price.totalPrice,
        userId: tracking.userId,
        apiKeyId: tracking.apiKeyId,
        apiKeyPollenBalance: tracking.apiKeyPollenBalance,
        byopClientKeyId: tracking.byopClientKeyId,
        modelResolved: DEFAULT_REALTIME_MODEL,
    });

    if (!tracking.rateLimitConsumed) {
        await c.var.frontendKeyRateLimit?.consumePollen(price.totalPrice);
        tracking.rateLimitConsumed = true;
    }

    const balances = await getUserBalance(db, tracking.userId);
    await sendToTinybird(
        createRealtimeTrackingEvent({
            tracking,
            startTime: tracking.sessionStartTime,
            endTime: eventEndTime,
            usage,
            cost,
            price,
            markup: tracking.deduction.markup,
            payerBucket: tracking.deduction.payerBucket,
            balances,
        }),
        c.env.TINYBIRD_INGEST_URL,
        c.env.TINYBIRD_INGEST_TOKEN,
        c.get("log").getChild("realtime"),
    );
    tracking.settled = true;
}

function collectBillingEvents(
    upstream: WebSocket,
    billing: RealtimeBillingContext,
): void {
    upstream.addEventListener("message", (event) => {
        const eventData = parseEventData(event.data);
        const usage =
            extractResponseUsage(eventData) ??
            extractUnsupportedInputTranscriptionUsage(eventData);
        if (!usage) return;
        addUsage(billing.usage, usage);
    });
}

function extractUnsupportedInputTranscriptionUsage(
    eventData: unknown,
): Usage | null {
    const event = asRecord(eventData);
    if (!isInputAudioTranscriptionEventType(event.type)) return null;

    const usage = realtimeUsageToUsage(event.usage);
    return hasPositiveUsage(usage) ? usage : null;
}

function scheduleRealtimeSettlement(
    c: Context<Env>,
    tracking: RealtimeBillingContext,
): void {
    if (tracking.settled || tracking.settlementInFlight) return;
    const log = c.get("log").getChild("realtime");
    tracking.settlementInFlight = true;
    c.executionCtx.waitUntil(
        settleRealtimeSession(c, tracking)
            .catch((error) => {
                log.error("Realtime session billing failed: {error}", {
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                if (tracking.settled || tracking.settlementAttempts >= 2) {
                    return;
                }
                return settleRealtimeSession(c, tracking).catch(
                    (retryError) => {
                        log.error(
                            "Realtime session billing retry failed: {error}",
                            {
                                error:
                                    retryError instanceof Error
                                        ? retryError.message
                                        : String(retryError),
                            },
                        );
                    },
                );
            })
            .finally(() => {
                tracking.settlementInFlight = false;
            }),
    );
}

function wireClose(
    c: Context<Env>,
    source: WebSocket,
    target: WebSocket,
    tracking: RealtimeBillingContext,
): void {
    source.addEventListener("close", (event) => {
        closeSocket(target, event.code, event.reason);
        scheduleRealtimeSettlement(c, tracking);
    });
    source.addEventListener("error", () => {
        closeSocket(target, 1011, "Realtime proxy error");
        scheduleRealtimeSettlement(c, tracking);
    });
}

function proxyRealtimeWebSockets(
    c: Context<Env>,
    upstream: WebSocket,
    tracking: RealtimeBillingContext,
): Response {
    const pair = new WebSocketPair();
    const [client, downstream] = Object.values(pair) as [WebSocket, WebSocket];

    downstream.binaryType = "arraybuffer";
    downstream.accept({ allowHalfOpen: true });

    collectBillingEvents(upstream, tracking);
    forwardMessage(downstream, upstream, validateClientRealtimeEvent, () =>
        scheduleRealtimeSettlement(c, tracking),
    );
    forwardMessage(upstream, downstream, validateUpstreamRealtimeEvent, () =>
        scheduleRealtimeSettlement(c, tracking),
    );
    wireClose(c, downstream, upstream, tracking);
    wireClose(c, upstream, downstream, tracking);

    return new Response(null, {
        status: 101,
        webSocket: client,
    } as WebSocketResponseInit);
}

async function createRealtimeBillingContext(
    c: Context<Env>,
): Promise<RealtimeBillingContext> {
    const user = c.var.auth.requireUser();
    const apiKey = c.var.auth.apiKey;
    const apiKeyMetadata = apiKey?.metadata;
    const rawIp = getRealClientIp(c);
    const clientIp =
        rawIp !== "unknown" ? stripIPv4MappedPrefix(rawIp) : undefined;
    const referrer = extractReferrerHeader(c);

    return {
        userId: user.id,
        userTier: user.tier,
        userGithubId: user.githubId ? String(user.githubId) : undefined,
        userGithubUsername: user.githubUsername ?? undefined,
        apiKeyId: apiKey?.id,
        apiKeyName: apiKey?.name,
        apiKeyType: apiKeyMetadata?.keyType as ApiKeyType | undefined,
        apiKeyCreatedVia: apiKeyMetadata?.createdVia as string | undefined,
        apiKeyCreatedForApp: apiKey?.byopClientName ?? undefined,
        apiKeyCreatedForUserId: apiKey?.byopClientUserId ?? undefined,
        apiKeyClientId: apiKey?.byopClientKeyId ?? undefined,
        apiKeyPollenBalance: apiKey?.pollenBalance,
        byopClientKeyId: apiKey?.byopClientKeyId,
        requestId: c.get("requestId"),
        requestPath: getRoutePath(c),
        environment: c.env.ENVIRONMENT,
        ...referrer,
        ipSubnet: truncateIpToSubnet(clientIp),
        ipHash: await hashIp(clientIp, c.env.BETTER_AUTH_SECRET),
        sessionStartTime: new Date(),
        usage: {},
        settlementInFlight: false,
        settlementAttempts: 0,
        settled: false,
        rateLimitConsumed: false,
    };
}

export async function handleRealtimeWebSocket(
    c: Context<Env>,
): Promise<Response> {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    await c.var.auth.requireAuthorization({
        message:
            "Realtime WebSocket requires a Pollinations API key in the Authorization header or key query parameter.",
    });
    const user = c.var.auth.requireUser();

    const query = c.req.valid("query" as never) as RealtimeRequestQueryParams;
    const requestedModel = query.model;
    if (requestedModel !== DEFAULT_REALTIME_MODEL) {
        throw new HTTPException(400, {
            message: `Only ${DEFAULT_REALTIME_MODEL} is currently supported for realtime sessions.`,
        });
    }
    requireAllowedModel(c, requestedModel);

    // Same model-independent, estimated-price balance gate as every other
    // generation route (tier or pack balance, paidOnly handled by the model
    // definition). checkBalance reads model.resolved.
    c.set("model", {
        requested: requestedModel,
        resolved: DEFAULT_REALTIME_MODEL,
    });
    await checkBalance(c.var, c.env);

    if (!c.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY) {
        throw new HTTPException(503, {
            message: "Azure realtime provider is not configured.",
        });
    }

    const upstream = await connectAzureRealtime(c, user.id);
    if (upstream instanceof Response) return upstream;

    return proxyRealtimeWebSockets(
        c,
        upstream,
        await createRealtimeBillingContext(c),
    );
}
