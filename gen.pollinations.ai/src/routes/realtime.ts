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
import { redactCredentialQueryParams } from "@shared/observability/request-inputs.ts";
import {
    type BillingAdjustment,
    type CostDefinition,
    calculateUsageBilling,
    getPriceDefinitionForModel,
    type ModelDefinition,
    type PriceDefinition,
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
import { reduceAdjustmentsToEventFields } from "@/middleware/track.ts";
import {
    RealtimeUsageSchema,
    type ScribeRealtimeAudioFormat,
    type ScribeRealtimeRequestQueryParams,
} from "@/schemas/realtime.ts";
import { generateRandomId } from "@/util.ts";
import { checkBalance } from "@/utils/generation-access.ts";

type AzureRealtimeApiKey =
    | "AZURE_MYCELI_PROD_EASTUS2_API_KEY"
    | "AZURE_MYCELI_PROD_SWEDEN_API_KEY";

// Deployment names are independent of the public model ids. Mini is in East
// US 2 because Azure's Sweden Central control plane accepts the deployment but
// its Realtime data plane currently rejects the exact model.
const REALTIME_ROUTES = {
    "gpt-realtime-2.1": {
        endpoint:
            "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/realtime",
        deployment: "gpt-realtime-2-1",
        apiKeyEnv: "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    },
    "gpt-realtime-2.1-mini": {
        endpoint:
            "https://myceli-prod-eastus2.openai.azure.com/openai/v1/realtime",
        deployment: "gpt-realtime-2-1-mini",
        apiKeyEnv: "AZURE_MYCELI_PROD_EASTUS2_API_KEY",
    },
    "gpt-realtime-2": {
        endpoint:
            "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/realtime",
        deployment: "gpt-realtime-2",
        apiKeyEnv: "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    },
} satisfies Record<
    string,
    { endpoint: string; deployment: string; apiKeyEnv: AzureRealtimeApiKey }
>;
type AzureRealtimeModelName = keyof typeof REALTIME_ROUTES;
const UNSUPPORTED_TRANSCRIPTION_MESSAGE =
    "Realtime input transcription is not supported yet.";
type WebSocketResponse = Response & { webSocket?: WebSocket };
type WebSocketResponseInit = ResponseInit & { webSocket?: WebSocket };
type RealtimeDeduction = Awaited<ReturnType<typeof handleBalanceDeduction>>;
type RealtimeCacheUsage = {
    audioTokens: number;
    imageTokens: number;
};
type RealtimeBillingContext = {
    userId: string;
    userTier?: string;
    apiKeyId?: string;
    apiKeyName?: string;
    apiKeyType?: "secret" | "publishable";
    apiKeyCreatedVia?: string;
    apiKeyCreatedForApp?: string;
    apiKeyCreatedForUserId?: string;
    apiKeyClientId?: string;
    apiKeyPollenBalance?: number | null;
    byopClientKeyId?: string | null;
    modelRequested: string;
    resolvedModelRequested: string;
    modelDefinition: ModelDefinition;
    modelCostDefinition: CostDefinition;
    modelPriceDefinition: PriceDefinition;
    requestId: string;
    requestPath: string;
    environment: string;
    referrerUrl?: string;
    referrerDomain?: string;
    ipSubnet?: string;
    ipHash?: string;
    sessionStartTime: Date;
    usage: Usage;
    cacheUsage: RealtimeCacheUsage;
    missingCacheDetailsWarned: boolean;
    settlementInFlight: boolean;
    settlementAttempts: number;
    settled: boolean;
    deduction?: RealtimeDeduction;
    rateLimitConsumed: boolean;
};

function requireAllowedModel(c: Context<Env>, model: string): void {
    const allowedModels = c.var.auth.apiKey?.permissions?.models;
    if (allowedModels && !allowedModels.includes(model)) {
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

function buildUpstreamUrl(model: AzureRealtimeModelName): string {
    const route = REALTIME_ROUTES[model];
    const upstreamUrl = new URL(route.endpoint);
    upstreamUrl.searchParams.set("model", route.deployment);
    return upstreamUrl.toString();
}

async function connectAzureRealtime(
    c: Context<Env>,
    userId: string,
    model: AzureRealtimeModelName,
): Promise<WebSocket | Response> {
    const route = REALTIME_ROUTES[model];
    const apiKey = c.env[route.apiKeyEnv];
    if (!apiKey) {
        throw new HTTPException(503, {
            message: "Azure realtime provider is not configured.",
        });
    }

    const response = (await fetch(buildUpstreamUrl(model), {
        headers: {
            "api-key": apiKey,
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

const SCRIBE_REALTIME_ENDPOINT =
    "https://api.elevenlabs.io/v1/speech-to-text/realtime";

const SCRIBE_AUDIO_FORMAT = {
    pcm_8000: { sampleRate: 8000, bytesPerSecond: 16_000 },
    pcm_16000: { sampleRate: 16_000, bytesPerSecond: 32_000 },
    pcm_22050: { sampleRate: 22_050, bytesPerSecond: 44_100 },
    pcm_24000: { sampleRate: 24_000, bytesPerSecond: 48_000 },
    pcm_44100: { sampleRate: 44_100, bytesPerSecond: 88_200 },
    pcm_48000: { sampleRate: 48_000, bytesPerSecond: 96_000 },
    ulaw_8000: { sampleRate: 8000, bytesPerSecond: 8000 },
} satisfies Record<
    ScribeRealtimeAudioFormat,
    { sampleRate: number; bytesPerSecond: number }
>;

function buildScribeRealtimeUrl(
    query: ScribeRealtimeRequestQueryParams,
): string {
    const url = new URL(SCRIBE_REALTIME_ENDPOINT);
    url.searchParams.set("model_id", "scribe_v2_realtime");
    url.searchParams.set("audio_format", query.audio_format);
    url.searchParams.set("commit_strategy", query.commit_strategy);

    for (const field of [
        "language_code",
        "vad_threshold",
        "vad_silence_threshold_secs",
        "min_speech_duration_ms",
        "min_silence_duration_ms",
    ] as const) {
        const value = query[field];
        if (value !== undefined) url.searchParams.set(field, String(value));
    }
    for (const field of [
        "include_timestamps",
        "include_language_detection",
        "no_verbatim",
        "filter_background_audio",
    ] as const) {
        if (query[field]) url.searchParams.set(field, "true");
    }
    return url.toString();
}

async function connectScribeRealtime(
    c: Context<Env>,
    query: ScribeRealtimeRequestQueryParams,
): Promise<WebSocket | Response> {
    const apiKey = c.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        throw new HTTPException(503, {
            message: "ElevenLabs realtime provider is not configured.",
        });
    }

    const response = (await fetch(buildScribeRealtimeUrl(query), {
        headers: {
            "xi-api-key": apiKey,
            Upgrade: "websocket",
        },
    })) as WebSocketResponse;
    const upstreamSocket = response.webSocket;
    if (upstreamSocket) {
        upstreamSocket.binaryType = "arraybuffer";
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
    if (
        !code ||
        code === 1004 ||
        code === 1005 ||
        code === 1006 ||
        code === 1015
    ) {
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

function inspectScribeInput(
    data: unknown,
    audioFormat: ScribeRealtimeAudioFormat,
): { audioSeconds: number } | { error: string } {
    if (typeof data !== "string") {
        return { error: "Scribe realtime expects JSON text messages." };
    }

    let event: Record<string, unknown>;
    try {
        const parsed = JSON.parse(data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { error: "Scribe realtime expects a JSON object." };
        }
        event = parsed as Record<string, unknown>;
    } catch {
        return { error: "Scribe realtime received malformed JSON." };
    }

    if (event.message_type !== "input_audio_chunk") {
        return {
            error: "Scribe realtime accepts only input_audio_chunk messages.",
        };
    }
    if (typeof event.audio_base_64 !== "string") {
        return { error: "input_audio_chunk requires audio_base_64." };
    }
    if (event.commit !== undefined && typeof event.commit !== "boolean") {
        return { error: "input_audio_chunk commit must be a boolean." };
    }
    if (
        event.previous_text !== undefined &&
        typeof event.previous_text !== "string"
    ) {
        return { error: "input_audio_chunk previous_text must be a string." };
    }

    const format = SCRIBE_AUDIO_FORMAT[audioFormat];
    if (
        event.sample_rate !== undefined &&
        event.sample_rate !== format.sampleRate
    ) {
        return {
            error: `input_audio_chunk sample_rate must be ${format.sampleRate} for ${audioFormat}.`,
        };
    }

    const base64 = event.audio_base_64;
    if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(
            base64,
        )
    ) {
        return { error: "input_audio_chunk audio_base_64 is invalid." };
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const byteLength = Math.floor((base64.length * 3) / 4) - padding;
    if (audioFormat !== "ulaw_8000" && byteLength % 2 !== 0) {
        return {
            error: "PCM audio chunks must contain complete 16-bit samples.",
        };
    }

    return { audioSeconds: byteLength / format.bytesPerSecond };
}

function forwardScribeInput(
    c: Context<Env>,
    source: WebSocket,
    target: WebSocket,
    audioFormat: ScribeRealtimeAudioFormat,
    tracking: RealtimeBillingContext,
): void {
    source.addEventListener("message", (event) => {
        const inspected = inspectScribeInput(event.data, audioFormat);
        if ("error" in inspected) {
            closeSocket(source, 1008, inspected.error);
            closeSocket(target, 1008, inspected.error);
            scheduleRealtimeSettlement(c, tracking);
            return;
        }
        if (!isOpen(target)) return;
        addUsage(tracking.usage, {
            promptAudioSeconds: inspected.audioSeconds,
        });
        target.send(event.data);
    });
}

const SCRIBE_ERROR_MESSAGE_TYPES = new Set([
    "auth_error",
    "chunk_size_exceeded",
    "commit_throttled",
    "insufficient_audio_activity",
    "invalid_request",
    "queue_overflow",
    "quota_exceeded",
    "rate_limited",
    "transcriber_error",
    "unaccepted_terms",
]);

function forwardScribeOutput(
    c: Context<Env>,
    source: WebSocket,
    target: WebSocket,
    tracking: RealtimeBillingContext,
): void {
    const log = c.get("log").getChild("realtime");
    source.addEventListener("message", (event) => {
        const providerEvent = asRecord(parseEventData(event.data));
        const messageType = providerEvent.message_type;
        if (
            typeof messageType !== "string" ||
            !SCRIBE_ERROR_MESSAGE_TYPES.has(messageType)
        ) {
            if (isOpen(target)) target.send(event.data);
            return;
        }

        log.warn("Scribe realtime provider error: type={type}", {
            type: messageType,
        });
        if (isOpen(target)) {
            target.send(
                JSON.stringify({
                    message_type: messageType,
                    error: "Realtime transcription failed.",
                }),
            );
        }
        closeSocket(source, 1011, "Realtime transcription failed");
        closeSocket(target, 1011, "Realtime transcription failed");
        scheduleRealtimeSettlement(c, tracking);
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

type ParsedRealtimeUsage = {
    usage: Usage;
    cacheUsage: RealtimeCacheUsage;
    cacheDetailsIncomplete: boolean;
};

function parseRealtimeUsage(rawUsage: unknown): ParsedRealtimeUsage | null {
    const parsed = RealtimeUsageSchema.safeParse(rawUsage);
    if (!parsed.success) return null;
    const usage = parsed.data;
    const inputDetails = usage.input_token_details ?? {};
    const outputDetails = usage.output_token_details ?? {};
    const cachedDetails = inputDetails.cached_tokens_details ?? {};

    const cachedTextTokens = numeric(cachedDetails.text_tokens);
    const cachedAudioTokens = numeric(cachedDetails.audio_tokens);
    const cachedImageTokens = numeric(cachedDetails.image_tokens);
    const reportedCachedTokens = numeric(inputDetails.cached_tokens);
    const detailedCachedTokens =
        cachedTextTokens + cachedAudioTokens + cachedImageTokens;
    const cachedTokens = reportedCachedTokens || detailedCachedTokens;
    const cacheDetailsIncomplete =
        reportedCachedTokens > 0 &&
        (inputDetails.cached_tokens_details == null ||
            detailedCachedTokens !== reportedCachedTokens);

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

    return {
        usage: positiveEntries({
            promptTextTokens,
            promptCachedTokens: cachedTokens,
            promptAudioTokens,
            promptImageTokens,
            completionTextTokens,
            completionAudioTokens,
        }),
        cacheUsage: {
            audioTokens: cachedAudioTokens,
            imageTokens: cachedImageTokens,
        },
        cacheDetailsIncomplete,
    };
}

function realtimeUsageToUsage(rawUsage: unknown): Usage {
    return parseRealtimeUsage(rawUsage)?.usage ?? {};
}

function extractResponseBilling(
    eventData: unknown,
): ParsedRealtimeUsage | null {
    const event = asRecord(eventData);
    if (event.type !== "response.done") return null;
    const response = asRecord(event.response);
    const parsed = parseRealtimeUsage(response.usage);
    return parsed && Object.keys(parsed.usage).length ? parsed : null;
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
    adjustments: BillingAdjustment[];
    markup: MarkupResolution | null;
    payerBucket: "tier" | "pack" | null;
    balances: { tierBalance: number; packBalance: number };
}): TinybirdEvent {
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
        apiKeyId: args.tracking.apiKeyId,
        apiKeyName: args.tracking.apiKeyName,
        apiKeyType: args.tracking.apiKeyType,
        apiKeyCreatedVia: args.tracking.apiKeyCreatedVia,
        apiKeyCreatedForApp: args.tracking.apiKeyCreatedForApp,
        apiKeyCreatedForUserId: args.tracking.apiKeyCreatedForUserId,
        apiKeyClientId: args.tracking.apiKeyClientId,
        referrerUrl: args.tracking.referrerUrl,
        referrerDomain: args.tracking.referrerDomain,
        modelRequested: args.tracking.modelRequested,
        resolvedModelRequested: args.tracking.resolvedModelRequested,
        modelUsed: args.tracking.resolvedModelRequested,
        modelProviderUsed: args.tracking.modelDefinition.provider,
        isBilledUsage: true,
        ...getPostDeductionBalances(args.payerBucket, args.balances),
        ...priceToEventParams(args.tracking.modelPriceDefinition),
        ...usageToEventParams(args.usage),
        ...reduceAdjustmentsToEventFields(args.adjustments),
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

    const { cost, price, adjustments } = calculateUsageBilling({
        model: tracking.resolvedModelRequested,
        usage,
        servedBy: tracking.modelDefinition,
        output: { realtimeCache: tracking.cacheUsage },
    });
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
        modelPaidOnly: tracking.modelDefinition.paidOnly,
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
            adjustments,
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
    c: Context<Env>,
    upstream: WebSocket,
    billing: RealtimeBillingContext,
): void {
    const log = c.get("log").getChild("realtime");
    upstream.addEventListener("message", (event) => {
        const eventData = parseEventData(event.data);
        const responseBilling = extractResponseBilling(eventData);
        if (responseBilling) {
            addUsage(billing.usage, responseBilling.usage);
            billing.cacheUsage.audioTokens +=
                responseBilling.cacheUsage.audioTokens;
            billing.cacheUsage.imageTokens +=
                responseBilling.cacheUsage.imageTokens;
            if (
                responseBilling.cacheDetailsIncomplete &&
                !billing.missingCacheDetailsWarned
            ) {
                billing.missingCacheDetailsWarned = true;
                log.warn(
                    "Realtime cached token modality details are missing or incomplete; unmatched cached tokens use the cached-text rate: model={model}",
                    { model: billing.resolvedModelRequested },
                );
            }
            return;
        }

        const transcriptionUsage =
            extractUnsupportedInputTranscriptionUsage(eventData);
        if (transcriptionUsage) addUsage(billing.usage, transcriptionUsage);
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

function wireScribeClose(
    c: Context<Env>,
    source: WebSocket,
    target: WebSocket,
    tracking: RealtimeBillingContext,
): void {
    source.addEventListener("close", (event) => {
        try {
            closeSocket(target, event.code, event.reason);
            if (source.readyState !== WebSocket.CLOSED) {
                const closeCode = normalizeCloseCode(event.code);
                if (closeCode) source.close(closeCode, event.reason);
                else source.close();
            }
        } finally {
            scheduleRealtimeSettlement(c, tracking);
        }
    });
    source.addEventListener("error", () => {
        try {
            closeSocket(target, 1011, "Realtime proxy error");
            closeSocket(source, 1011, "Realtime proxy error");
        } finally {
            scheduleRealtimeSettlement(c, tracking);
        }
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

    collectBillingEvents(c, upstream, tracking);
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

function proxyScribeRealtimeWebSockets(
    c: Context<Env>,
    upstream: WebSocket,
    tracking: RealtimeBillingContext,
    audioFormat: ScribeRealtimeAudioFormat,
): Response {
    const pair = new WebSocketPair();
    const [client, downstream] = Object.values(pair) as [WebSocket, WebSocket];

    downstream.binaryType = "arraybuffer";
    forwardScribeInput(c, downstream, upstream, audioFormat, tracking);
    forwardScribeOutput(c, upstream, downstream, tracking);
    wireScribeClose(c, downstream, upstream, tracking);
    wireScribeClose(c, upstream, downstream, tracking);
    downstream.accept({ allowHalfOpen: true });
    upstream.accept({ allowHalfOpen: true });

    return new Response(null, {
        status: 101,
        webSocket: client,
    } as WebSocketResponseInit);
}

async function createRealtimeBillingContext(
    c: Context<Env>,
): Promise<RealtimeBillingContext> {
    const user = c.var.auth.requireUser();
    const apiKeyMetadata = c.var.auth.apiKey?.metadata as
        | Record<string, unknown>
        | undefined;
    const rawIp = getRealClientIp(c);
    const clientIp =
        rawIp !== "unknown" ? stripIPv4MappedPrefix(rawIp) : undefined;
    const referrer = extractReferrerHeader(c);
    const modelInfo = c.var.model;
    const modelPriceDefinition = getPriceDefinitionForModel(
        modelInfo.definition,
    );
    if (!modelInfo.definition.cost || !modelPriceDefinition) {
        throw new Error(
            `Failed to get price definition for model: ${modelInfo.resolved}`,
        );
    }

    return {
        userId: user.id,
        userTier: user.tier,
        apiKeyId: c.var.auth.apiKey?.id,
        apiKeyName: c.var.auth.apiKey?.name,
        apiKeyType: apiKeyMetadata?.keyType as "secret" | "publishable",
        apiKeyCreatedVia: apiKeyMetadata?.createdVia as string | undefined,
        apiKeyCreatedForApp: c.var.auth.apiKey?.byopClientName ?? undefined,
        apiKeyCreatedForUserId:
            c.var.auth.apiKey?.byopClientUserId ?? undefined,
        apiKeyClientId: c.var.auth.apiKey?.byopClientKeyId ?? undefined,
        apiKeyPollenBalance: c.var.auth.apiKey?.pollenBalance,
        byopClientKeyId: c.var.auth.apiKey?.byopClientKeyId,
        modelRequested: modelInfo.requested,
        resolvedModelRequested: modelInfo.resolved,
        modelDefinition: modelInfo.definition,
        modelCostDefinition: modelInfo.definition.cost,
        modelPriceDefinition,
        requestId: c.get("requestId"),
        requestPath: getRoutePath(c),
        environment: c.env.ENVIRONMENT,
        ...referrer,
        ipSubnet: truncateIpToSubnet(clientIp),
        ipHash: await hashIp(clientIp, c.env.BETTER_AUTH_SECRET),
        sessionStartTime: new Date(),
        usage: {},
        cacheUsage: { audioTokens: 0, imageTokens: 0 },
        missingCacheDetailsWarned: false,
        settlementInFlight: false,
        settlementAttempts: 0,
        settled: false,
        rateLimitConsumed: false,
    };
}

async function authorizeRealtimeSession(c: Context<Env>): Promise<string> {
    await c.var.auth.requireAuthorization({
        message:
            "Realtime WebSocket requires a Pollinations API key in the Authorization header or key query parameter.",
    });
    const user = c.var.auth.requireUser();

    const resolvedModel = c.var.model.resolved;
    requireAllowedModel(c, resolvedModel);

    // Same model-independent, estimated-price balance gate as every other
    // generation route (tier or pack balance, paidOnly handled by the resolved
    // model definition). checkBalance reads c.var.model.
    await checkBalance(c.var, c.env);
    return user.id;
}

export async function handleRealtimeWebSocket(
    c: Context<Env>,
): Promise<Response> {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    const userId = await authorizeRealtimeSession(c);

    const upstream = await connectAzureRealtime(
        c,
        userId,
        c.var.model.resolved as AzureRealtimeModelName,
    );
    if (upstream instanceof Response) return upstream;

    return proxyRealtimeWebSockets(
        c,
        upstream,
        await createRealtimeBillingContext(c),
    );
}

export async function handleScribeRealtimeWebSocket(
    c: Context<Env>,
): Promise<Response> {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    await authorizeRealtimeSession(c);
    const query = c.req.valid(
        "query" as never,
    ) as ScribeRealtimeRequestQueryParams;
    const tracking = await createRealtimeBillingContext(c);
    const upstream = await connectScribeRealtime(c, query);
    if (upstream instanceof Response) return upstream;

    return proxyScribeRealtimeWebSockets(
        c,
        upstream,
        tracking,
        query.audio_format,
    );
}
