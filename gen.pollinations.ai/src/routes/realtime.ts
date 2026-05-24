import { getUserBalance } from "@shared/billing/balance.ts";
import {
    handleBalanceDeduction,
    type MarkupResolution,
} from "@shared/billing/track-helpers.ts";
import { getRealClientIp } from "@shared/client-ip.ts";
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
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { sendToTinybird } from "@/events.ts";
import type { RealtimeRequestQueryParams } from "@/schemas/realtime.ts";
import { generateRandomId, getRoutePath } from "@/util.ts";

const OPENAI_REALTIME_WEBSOCKET_URL = "https://api.openai.com/v1/realtime";
type WebSocketResponse = Response & { webSocket?: WebSocket };
type WebSocketResponseInit = ResponseInit & { webSocket?: WebSocket };
type RealtimeBillingContext = {
    userId: string;
    userTier?: string;
    userGithubId?: string;
    userGithubUsername?: string;
    apiKeyId?: string;
    apiKeyName?: string;
    apiKeyType?: "secret" | "publishable";
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
    settled: boolean;
};

function requireAllowedModel(c: Context<Env>, model: string): void {
    const allowedModels = c.var.auth.apiKey?.permissions?.models;
    if (allowedModels?.length && !allowedModels.includes(model)) {
        throw new HTTPException(403, {
            message: `Model '${model}' is not allowed for this API key`,
        });
    }
}

function requirePositiveApiKeyBudget(c: Context<Env>): void {
    const budget = c.var.auth.apiKey?.pollenBalance;
    if (typeof budget === "number" && budget <= 0) {
        throw new HTTPException(402, {
            message: "API key budget too low for realtime session.",
        });
    }
}

function bytesToHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function createSafetyIdentifier(
    userId: string,
    secret: string,
): Promise<string> {
    const data = new TextEncoder().encode(`${secret}:${userId}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

function buildUpstreamUrl(requestUrl: string): string {
    const incomingUrl = new URL(requestUrl);
    const upstreamUrl = new URL(OPENAI_REALTIME_WEBSOCKET_URL);
    for (const [key, value] of incomingUrl.searchParams) {
        if (key === "key" || key === "model") continue;
        upstreamUrl.searchParams.append(key, value);
    }
    upstreamUrl.searchParams.set("model", DEFAULT_REALTIME_MODEL);
    return upstreamUrl.toString();
}

async function connectOpenAIRealtime(
    c: Context<Env>,
    userId: string,
): Promise<WebSocket | Response> {
    const response = (await fetch(buildUpstreamUrl(c.req.url), {
        headers: {
            "Authorization": `Bearer ${c.env.OPENAI_API_KEY}`,
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

function forwardMessage(source: WebSocket, target: WebSocket): void {
    source.addEventListener("message", (event) => {
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
    const usage = asRecord(rawUsage);
    const inputDetails = asRecord(usage.input_token_details);
    const outputDetails = asRecord(usage.output_token_details);
    const cachedDetails = asRecord(inputDetails.cached_tokens_details);

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
    const detailedInputTokens =
        numeric(inputDetails.text_tokens) +
        numeric(inputDetails.audio_tokens) +
        numeric(inputDetails.image_tokens);
    const promptTextTokens =
        detailedInputTokens > 0
            ? Math.max(0, numeric(inputDetails.text_tokens) - cachedTextTokens)
            : Math.max(0, numeric(usage.input_tokens) - cachedTokens);
    const completionAudioTokens = numeric(outputDetails.audio_tokens);
    const completionTextTokens =
        numeric(outputDetails.text_tokens) ||
        Math.max(0, numeric(usage.output_tokens) - completionAudioTokens);

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

function extractReferrerHeader(c: Context<Env>): {
    referrerUrl?: string;
    referrerDomain?: string;
} {
    const referrerUrl = c.req.header("referer") || undefined;
    if (!referrerUrl) return {};
    try {
        return { referrerUrl, referrerDomain: new URL(referrerUrl).hostname };
    } catch {
        return { referrerUrl };
    }
}

async function hashIp(
    ip: string | undefined,
    salt: string,
): Promise<string | undefined> {
    if (!ip) return undefined;
    const data = new TextEncoder().encode(`${salt}:${ip}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

function stripIPv4MappedPrefix(ip: string): string {
    const match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    return match ? match[1] : ip;
}

function expandIPv6(ip: string): string {
    if (!ip.includes("::")) {
        return ip
            .split(":")
            .map((group) => group.padStart(4, "0"))
            .join(":");
    }
    const halves = ip.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const middle = Array(8 - left.length - right.length).fill("0000");
    return [...left, ...middle, ...right]
        .map((group) => group.padStart(4, "0"))
        .join(":");
}

function truncateIpToSubnet(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    const normalized = stripIPv4MappedPrefix(ip);
    if (normalized.includes(".")) {
        const parts = normalized.split(".");
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    if (normalized.includes(":")) {
        const groups = expandIPv6(normalized).split(":");
        return `${groups[0]}:${groups[1]}:${groups[2]}::`;
    }
    return undefined;
}

function getPostDeductionBalances(
    payerBucket: "tier" | "pack" | null,
    balances: { tierBalance: number; packBalance: number },
) {
    if (!payerBucket) {
        return {};
    }
    return {
        selectedMeterId: `local:${payerBucket}`,
        selectedMeterSlug:
            payerBucket === "tier" ? "v1:meter:tier" : "v1:meter:pack",
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
    tracking.settled = true;

    const usage = positiveEntries(tracking.usage);
    if (!hasPositiveUsage(usage)) return;

    const cost = calculateCost(DEFAULT_REALTIME_MODEL, usage);
    const price = calculatePrice(DEFAULT_REALTIME_MODEL, usage);
    if (price.totalPrice <= 0) return;

    const eventEndTime = new Date();
    const db = drizzle(c.env.DB) as unknown as Parameters<
        typeof handleBalanceDeduction
    >[0]["db"];

    const deduction = await handleBalanceDeduction({
        db,
        isBilledUsage: true,
        totalPrice: price.totalPrice,
        userId: tracking.userId,
        apiKeyId: tracking.apiKeyId,
        apiKeyPollenBalance: tracking.apiKeyPollenBalance,
        byopClientKeyId: tracking.byopClientKeyId,
        modelResolved: DEFAULT_REALTIME_MODEL,
    });

    await c.var.frontendKeyRateLimit?.consumePollen(price.totalPrice);

    const balances = await getUserBalance(db, tracking.userId);
    await sendToTinybird(
        createRealtimeTrackingEvent({
            tracking,
            startTime: tracking.sessionStartTime,
            endTime: eventEndTime,
            usage,
            cost,
            price,
            markup: deduction.markup,
            payerBucket: deduction.payerBucket,
            balances,
        }),
        c.env.TINYBIRD_INGEST_URL,
        c.env.TINYBIRD_INGEST_TOKEN,
        c.get("log").getChild("realtime"),
    );
}

function collectBillingEvents(
    upstream: WebSocket,
    billing: RealtimeBillingContext,
): void {
    upstream.addEventListener("message", (event) => {
        const usage = extractResponseUsage(parseEventData(event.data));
        if (!usage) return;
        addUsage(billing.usage, usage);
    });
}

function scheduleRealtimeSettlement(
    c: Context<Env>,
    tracking: RealtimeBillingContext,
): void {
    const log = c.get("log").getChild("realtime");
    c.executionCtx.waitUntil(
        settleRealtimeSession(c, tracking).catch((error) => {
            log.error("Realtime session billing failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
            });
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
    forwardMessage(downstream, upstream);
    forwardMessage(upstream, downstream);
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
    const apiKeyMetadata = c.var.auth.apiKey?.metadata as
        | Record<string, unknown>
        | undefined;
    const rawIp = getRealClientIp(c);
    const clientIp =
        rawIp !== "unknown" ? stripIPv4MappedPrefix(rawIp) : undefined;
    const referrer = extractReferrerHeader(c);

    return {
        userId: user.id,
        userTier: user.tier,
        userGithubId: user.githubId ? String(user.githubId) : undefined,
        userGithubUsername: user.githubUsername ?? undefined,
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
        requestId: c.get("requestId"),
        requestPath: getRoutePath(c),
        environment: c.env.ENVIRONMENT,
        ...referrer,
        ipSubnet: truncateIpToSubnet(clientIp),
        ipHash: await hashIp(clientIp, c.env.BETTER_AUTH_SECRET),
        sessionStartTime: new Date(),
        usage: {},
        settled: false,
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
    requirePositiveApiKeyBudget(c);
    await c.var.balance.requirePaidBalance(
        user.id,
        "Realtime requires paid pack balance.",
    );

    const query = c.req.valid("query" as never) as RealtimeRequestQueryParams;
    const requestedModel = query.model;
    if (requestedModel !== DEFAULT_REALTIME_MODEL) {
        throw new HTTPException(400, {
            message: `Only ${DEFAULT_REALTIME_MODEL} is currently supported for realtime sessions.`,
        });
    }
    requireAllowedModel(c, requestedModel);

    if (!c.env.OPENAI_API_KEY) {
        throw new HTTPException(503, {
            message: "OpenAI realtime provider is not configured.",
        });
    }

    const upstream = await connectOpenAIRealtime(c, user.id);
    if (upstream instanceof Response) return upstream;

    return proxyRealtimeWebSockets(
        c,
        upstream,
        await createRealtimeBillingContext(c),
    );
}
