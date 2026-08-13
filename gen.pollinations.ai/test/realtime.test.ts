import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getLogger } from "@logtape/logtape";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

type WebSocketResponse = Response & { webSocket?: WebSocket };
type WebSocketResponseInit = ResponseInit & { webSocket?: WebSocket };

afterEach(() => {
    vi.restoreAllMocks();
});

const scribeTestEnv = {
    ...env,
    ELEVENLABS_API_KEY: "test-eleven-key",
};

async function fetchWorker(
    path: string,
    init: RequestInit = {},
    bindings = env,
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        bindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

async function fetchWorkerWithContext(
    path: string,
    init: RequestInit = {},
    bindings = env,
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        bindings,
        ctx,
    );
    return { response: response as WebSocketResponse, ctx };
}

function nextMessage(socket: WebSocket): Promise<unknown> {
    return new Promise((resolve) => {
        socket.addEventListener("message", (event) => resolve(event.data), {
            once: true,
        });
    });
}

function nextClose(socket: WebSocket): Promise<CloseEvent> {
    return new Promise((resolve) => {
        socket.addEventListener("close", (event) => resolve(event), {
            once: true,
        });
    });
}

function zeroAudioBase64(byteLength: number): string {
    return btoa("\0".repeat(byteLength));
}

function mockRealtimeProvider(initialMessage?: string) {
    let upstreamRequest: Request | undefined;
    let upstreamServer: WebSocket | undefined;
    let upstreamServerAccepted = false;
    const tinybirdRequests: Request[] = [];

    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const request = new Request(input, init);
            if (request.url.includes("/v0/events?name=generation_event_v2")) {
                tinybirdRequests.push(request);
                return new Response("", { status: 202 });
            }
            // checkBalance fetches the model-stats pipe for estimated pricing.
            if (request.url.includes("public_model_stats.json")) {
                return Response.json({ data: [] });
            }

            upstreamRequest = request;
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair) as [
                WebSocket,
                WebSocket,
            ];
            upstreamServer = server;
            if (initialMessage) {
                server.accept();
                upstreamServerAccepted = true;
                server.send(initialMessage);
            }
            return new Response(null, {
                status: 101,
                webSocket: client,
            } as WebSocketResponseInit);
        });

    return {
        fetchMock,
        tinybirdRequests,
        get request() {
            if (!upstreamRequest) {
                throw new Error("Expected upstream realtime request");
            }
            return upstreamRequest;
        },
        get server() {
            if (!upstreamServer) {
                throw new Error("Expected upstream realtime WebSocket");
            }
            return upstreamServer;
        },
        get serverAccepted() {
            return upstreamServerAccepted;
        },
    };
}

async function getUserBalances(userId: string) {
    const db = drizzle(env.DB);
    const [user] = await db
        .select({
            tierBalance: userTable.tierBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(eq(userTable.id, userId));
    return user;
}

async function waitForPackBalanceBelow(userId: string, maxBalance: number) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const user = await getUserBalances(userId);
        if (user?.packBalance != null && user.packBalance < maxBalance) {
            return user;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return getUserBalances(userId);
}

async function waitForTinybirdRequests(
    upstream: ReturnType<typeof mockRealtimeProvider>,
    count = 1,
) {
    for (let attempt = 0; attempt < 20; attempt++) {
        if (upstream.tinybirdRequests.length >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function openPaidRealtimeSession({
    name,
    model = "gpt-realtime-2",
    referrer,
}: {
    name: string;
    model?: string;
    referrer?: string;
}) {
    const { key, userId } = await createTestApiKey({
        name,
        pollenBudget: 1,
        user: { tierBalance: 0, packBalance: 1 },
    });
    const upstream = mockRealtimeProvider();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        Upgrade: "websocket",
    };
    if (referrer) headers.Referer = referrer;

    const { response, ctx } = await fetchWorkerWithContext(
        `/v1/realtime?model=${model}`,
        { headers },
    );

    expect(response.status).toBe(101);
    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    upstream.server.accept();

    return { client, ctx, upstream, userId };
}

async function openPaidScribeSession({
    name,
    query = "",
    initialProviderMessage,
}: {
    name: string;
    query?: string;
    initialProviderMessage?: string;
}) {
    const { key, userId } = await createTestApiKey({
        name,
        pollenBudget: 1,
        user: { tierBalance: 0, packBalance: 1 },
    });
    const upstream = mockRealtimeProvider(initialProviderMessage);
    const { response, ctx } = await fetchWorkerWithContext(
        `/v1/audio/transcriptions/realtime?${query}`,
        {
            headers: {
                Authorization: `Bearer ${key}`,
                Upgrade: "websocket",
            },
        },
        scribeTestEnv,
    );

    expect(response.status).toBe(101);
    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    const initialClientMessage = initialProviderMessage
        ? nextMessage(client)
        : undefined;
    client.accept();
    if (!upstream.serverAccepted) upstream.server.accept();

    return { client, ctx, upstream, userId, initialClientMessage };
}

type PaidRealtimeSession = Awaited<ReturnType<typeof openPaidRealtimeSession>>;

async function closeRealtimeSession(session: PaidRealtimeSession) {
    session.client.close();
    session.upstream.server.close();
    await waitOnExecutionContext(session.ctx);
}

async function closeAndReadTelemetry(session: PaidRealtimeSession) {
    await closeRealtimeSession(session);
    await waitForTinybirdRequests(session.upstream);
    expect(session.upstream.tinybirdRequests).toHaveLength(1);
    return JSON.parse(
        await session.upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
}

const cachedModalityUsageEvent = JSON.stringify({
    type: "response.done",
    response: {
        usage: {
            input_tokens: 100,
            output_tokens: 30,
            input_token_details: {
                text_tokens: 40,
                audio_tokens: 50,
                image_tokens: 10,
                cached_tokens: 30,
                cached_tokens_details: {
                    text_tokens: 10,
                    audio_tokens: 15,
                    image_tokens: 5,
                },
            },
            output_token_details: {
                text_tokens: 20,
                audio_tokens: 10,
            },
        },
    },
});

async function expectClientEventRejected(
    paidApiKey: string,
    event: unknown,
): Promise<void> {
    const upstream = mockRealtimeProvider();

    const { response, ctx } = await fetchWorkerWithContext(
        "/v1/realtime?model=gpt-realtime-2",
        {
            headers: {
                Authorization: `Bearer ${paidApiKey}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(101);
    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    upstream.server.accept();

    let upstreamReceived = false;
    upstream.server.addEventListener("message", () => {
        upstreamReceived = true;
    });

    const closeEvent = nextClose(client);
    client.send(JSON.stringify(event));

    await expect(closeEvent).resolves.toMatchObject({
        code: 1008,
        reason: "Realtime input transcription is not supported yet.",
    });
    expect(upstreamReceived).toBe(false);
    await waitOnExecutionContext(ctx);
}

test("proxies an OpenAI-compatible realtime WebSocket with a paid key", async ({
    paidApiKey,
}) => {
    const upstream = mockRealtimeProvider();

    const { response, ctx } = await fetchWorkerWithContext("/v1/realtime", {
        headers: {
            Authorization: `Bearer ${paidApiKey}`,
            Upgrade: "websocket",
        },
    });

    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
    expect(upstream.request.url).toBe(
        "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/realtime?model=gpt-realtime-2-1",
    );
    expect(upstream.request.headers.get("Upgrade")).toBe("websocket");
    // Provider auth uses the Azure key, never the caller's Pollinations key.
    expect(upstream.request.headers.get("api-key")).toBeTruthy();
    expect(upstream.request.headers.get("api-key")).not.toBe(paidApiKey);
    expect(upstream.request.headers.get("Authorization")).toBeNull();
    expect(upstream.request.headers.get("OpenAI-Safety-Identifier")).toMatch(
        /^[a-f0-9]{64}$/,
    );

    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    upstream.server.accept();

    const upstreamMessage = nextMessage(upstream.server);
    const clientEvent = JSON.stringify({
        type: "session.update",
        session: { instructions: "test" },
    });
    client.send(clientEvent);
    await expect(upstreamMessage).resolves.toBe(clientEvent);

    const downstreamMessage = nextMessage(client);
    const serverEvent = JSON.stringify({
        type: "session.created",
        session: { model: "gpt-realtime-2-1" },
    });
    upstream.server.send(serverEvent);
    await expect(downstreamMessage).resolves.toBe(serverEvent);

    client.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);
});

test("routes the mini model through the working East US 2 deployment", async ({
    paidApiKey,
}) => {
    const upstream = mockRealtimeProvider();

    const { response, ctx } = await fetchWorkerWithContext(
        "/v1/realtime?model=gpt-realtime-2.1-mini",
        {
            headers: {
                Authorization: `Bearer ${paidApiKey}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(101);
    expect(upstream.request.url).toBe(
        "https://myceli-prod-eastus2.openai.azure.com/openai/v1/realtime?model=gpt-realtime-2-1-mini",
    );
    expect(upstream.request.headers.get("api-key")).toBeTruthy();

    response.webSocket?.accept();
    upstream.server.accept();
    response.webSocket?.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);
});

test("accepts publishable keys through the query string for thin clients", async () => {
    const { key } = await createTestApiKey({
        name: "paid-publishable-realtime-key",
        type: "publishable",
        pollenBudget: 10,
        user: { packBalance: 10 },
    });
    const upstream = mockRealtimeProvider();

    const { response, ctx } = await fetchWorkerWithContext(
        `/v1/realtime?model=gpt-realtime-2&key=${encodeURIComponent(key)}`,
        { headers: { Upgrade: "websocket" } },
    );

    expect(response.status).toBe(101);
    // One fetch for the model-stats balance check + one upstream WS connect.
    expect(upstream.request.url).toContain("azure.com/openai/v1/realtime");
    response.webSocket?.accept();
    upstream.server.accept();
    response.webSocket?.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);
});

test("proxies Scribe Realtime parameters without forwarding caller credentials", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-parameters-key",
        query: [
            "model=scribe-realtime",
            "audio_format=pcm_16000",
            "language_code=fr",
            "commit_strategy=vad",
            "vad_threshold=0.4",
            "vad_silence_threshold_secs=1.5",
            "min_speech_duration_ms=100",
            "min_silence_duration_ms=100",
            "include_timestamps=true",
            "include_language_detection=true",
            "no_verbatim=true",
        ].join("&"),
    });

    const upstreamUrl = new URL(session.upstream.request.url);
    expect(`${upstreamUrl.origin}${upstreamUrl.pathname}`).toBe(
        "https://api.elevenlabs.io/v1/speech-to-text/realtime",
    );
    expect(Object.fromEntries(upstreamUrl.searchParams)).toEqual({
        model_id: "scribe_v2_realtime",
        audio_format: "pcm_16000",
        commit_strategy: "vad",
        language_code: "fr",
        vad_threshold: "0.4",
        vad_silence_threshold_secs: "1.5",
        min_speech_duration_ms: "100",
        min_silence_duration_ms: "100",
        include_timestamps: "true",
        include_language_detection: "true",
        no_verbatim: "true",
    });
    expect(session.upstream.request.headers.get("xi-api-key")).toBeTruthy();
    expect(session.upstream.request.headers.get("Authorization")).toBeNull();

    const clientMessage = JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: zeroAudioBase64(3200),
        sample_rate: 16_000,
        commit: true,
        previous_text: "contexte",
    });
    const upstreamMessage = nextMessage(session.upstream.server);
    session.client.send(clientMessage);
    await expect(upstreamMessage).resolves.toBe(clientMessage);

    const providerMessage = JSON.stringify({
        message_type: "committed_transcript",
        text: "bonjour",
    });
    const downstreamMessage = nextMessage(session.client);
    session.upstream.server.send(providerMessage);
    await expect(downstreamMessage).resolves.toBe(providerMessage);

    const telemetry = await closeAndReadTelemetry(session);
    expect(telemetry.tokenCountPromptAudioSeconds).toBeCloseTo(0.1, 8);
});

test("forwards the initial Scribe session event after listeners are attached", async () => {
    const initialProviderMessage = JSON.stringify({
        message_type: "session_started",
        session_id: "session-1",
    });
    const session = await openPaidScribeSession({
        name: "scribe-realtime-initial-event-key",
        initialProviderMessage,
    });

    await expect(session.initialClientMessage).resolves.toBe(
        initialProviderMessage,
    );
    await closeRealtimeSession(session);
});

test.each([
    ["pcm_8000", 16_000, 8000],
    ["pcm_16000", 32_000, 16_000],
    ["pcm_22050", 44_100, 22_050],
    ["pcm_24000", 48_000, 24_000],
    ["pcm_44100", 88_200, 44_100],
    ["pcm_48000", 96_000, 48_000],
    ["ulaw_8000", 8000, 8000],
] as const)("bills one streamed second of %s at the exact Scribe Realtime rate", async (audioFormat, bytesPerSecond, sampleRate) => {
    const session = await openPaidScribeSession({
        name: `scribe-realtime-${audioFormat}-key`,
        query: `audio_format=${audioFormat}`,
    });
    const upstreamMessage = nextMessage(session.upstream.server);
    session.client.send(
        JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: zeroAudioBase64(bytesPerSecond),
            sample_rate: sampleRate,
            commit: true,
        }),
    );
    await upstreamMessage;

    const telemetry = await closeAndReadTelemetry(session);
    const user = await waitForPackBalanceBelow(session.userId, 1);
    const expectedCharge = 0.39 / 3600;
    const expectedLedgerCharge = roundPollenLedgerAmount(expectedCharge);
    expect(user?.packBalance).toBeCloseTo(1 - expectedLedgerCharge, 8);
    expect(telemetry.eventType).toBe("generate.realtime");
    expect(telemetry.resolvedModelRequested).toBe("scribe-realtime");
    expect(telemetry.modelProviderUsed).toBe("elevenlabs");
    expect(telemetry.tokenCountPromptAudioSeconds).toBe(1);
    expect(telemetry.totalCost).toBeCloseTo(expectedCharge, 12);
    expect(telemetry.totalPrice).toBeCloseTo(expectedLedgerCharge, 12);
});

test("rejects malformed Scribe audio without forwarding or billing it", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-malformed-audio-key",
    });
    let upstreamReceived = false;
    session.upstream.server.addEventListener("message", () => {
        upstreamReceived = true;
    });

    const closeEvent = nextClose(session.client);
    session.client.send(
        JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: "not base64!",
        }),
    );
    await expect(closeEvent).resolves.toMatchObject({
        code: 1008,
        reason: "input_audio_chunk audio_base_64 is invalid.",
    });
    await waitOnExecutionContext(session.ctx);

    expect(upstreamReceived).toBe(false);
    expect(session.upstream.tinybirdRequests).toHaveLength(0);
    expect((await getUserBalances(session.userId))?.packBalance).toBe(1);
});

test("sanitizes Scribe provider errors and settles accepted audio", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-provider-error-key",
    });
    const upstreamMessage = nextMessage(session.upstream.server);
    session.client.send(
        JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: zeroAudioBase64(32_000),
            sample_rate: 16_000,
        }),
    );
    await upstreamMessage;

    const providerError = nextMessage(session.client);
    const clientClose = nextClose(session.client);
    session.upstream.server.send(
        JSON.stringify({
            message_type: "quota_exceeded",
            error: "provider account details",
        }),
    );

    await expect(providerError).resolves.toBe(
        JSON.stringify({
            message_type: "quota_exceeded",
            error: "Realtime transcription failed.",
        }),
    );
    await expect(clientClose).resolves.toMatchObject({ code: 1011 });
    await waitOnExecutionContext(session.ctx);
    await waitForTinybirdRequests(session.upstream);
    const telemetry = JSON.parse(
        await session.upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
    expect(telemetry.tokenCountPromptAudioSeconds).toBe(1);
});

test.each([
    "/v1/audio/transcriptions/realtime?keyterms=Pollinations",
    "/v1/audio/transcriptions/realtime?entity_detection=all",
    "/v1/audio/transcriptions/realtime?model=scribe_v2_realtime",
    "/v1/audio/transcriptions/realtime?filter_background_audio=true&include_timestamps=true",
    "/v1/audio/transcriptions/realtime?vad_threshold=",
    "/v1/audio/transcriptions/realtime?min_speech_duration_ms=",
    "/v1/audio/transcriptions/realtime?include_timestamps",
])("rejects unsupported Scribe Realtime query %s", async (path) => {
    const { key } = await createTestApiKey({
        name: "scribe-realtime-invalid-query-key",
        user: { packBalance: 1 },
    });
    const upstream = mockRealtimeProvider();
    const response = await fetchWorker(path, {
        headers: {
            Authorization: `Bearer ${key}`,
            Upgrade: "websocket",
        },
    });

    expect(response.status).toBe(400);
    expect(upstream.fetchMock).not.toHaveBeenCalled();
});

test("enforces paid-only and model permissions for Scribe Realtime", async () => {
    const questOnly = await createTestApiKey({
        name: "scribe-realtime-quest-only-key",
        user: { tierBalance: 1, packBalance: 0 },
    });
    const emptyPermissions = await createTestApiKey({
        name: "scribe-realtime-empty-permissions-key",
        allowedModels: [],
        user: { packBalance: 1 },
    });

    const questResponse = await fetchWorker(
        "/v1/audio/transcriptions/realtime",
        {
            headers: {
                Authorization: `Bearer ${questOnly.key}`,
                Upgrade: "websocket",
            },
        },
    );
    const permissionResponse = await fetchWorker(
        "/v1/audio/transcriptions/realtime",
        {
            headers: {
                Authorization: `Bearer ${emptyPermissions.key}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(questResponse.status).toBe(402);
    expect(permissionResponse.status).toBe(403);
});

test("accepts a publishable key without forwarding it to ElevenLabs", async () => {
    const { key } = await createTestApiKey({
        name: "scribe-realtime-publishable-key",
        type: "publishable",
        user: { packBalance: 1 },
    });
    const upstream = mockRealtimeProvider();
    const { response, ctx } = await fetchWorkerWithContext(
        `/v1/audio/transcriptions/realtime?key=${encodeURIComponent(key)}`,
        { headers: { Upgrade: "websocket" } },
        scribeTestEnv,
    );

    expect(response.status).toBe(101);
    expect(upstream.request.url).not.toContain(key);
    expect(upstream.request.headers.get("xi-api-key")).toBeTruthy();
    response.webSocket?.accept();
    upstream.server.accept();
    response.webSocket?.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);
});

test("completes both sides of the Scribe close handshake", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-close-key",
    });
    const clientClose = nextClose(session.client);
    const upstreamClose = nextClose(session.upstream.server);

    session.client.close(1000, "done");

    await expect(clientClose).resolves.toMatchObject({ code: 1000 });
    await expect(upstreamClose).resolves.toMatchObject({ code: 1000 });
    await waitOnExecutionContext(session.ctx);
    expect(session.upstream.tinybirdRequests).toHaveLength(0);
});

test("rejects non-WebSocket realtime requests before calling OpenAI", async ({
    paidApiKey,
}) => {
    const upstreamFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({}));

    const response = await fetchWorker("/v1/realtime?model=gpt-realtime-2", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });

    expect(response.status).toBe(426);
    expect(await response.text()).toBe("Expected Upgrade: websocket");
    expect(upstreamFetch).not.toHaveBeenCalled();
});

test("rejects unsupported realtime models before calling OpenAI", async ({
    paidApiKey,
}) => {
    const upstreamFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({}));

    const response = await fetchWorker("/v1/realtime?model=gpt-realtime-mini", {
        headers: {
            Authorization: `Bearer ${paidApiKey}`,
            Upgrade: "websocket",
        },
    });

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
});

test("rejects unsupported realtime query parameters before calling OpenAI", async ({
    paidApiKey,
}) => {
    const upstreamFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({}));

    const response = await fetchWorker(
        "/v1/realtime?model=gpt-realtime-2&intent=transcription",
        {
            headers: {
                Authorization: `Bearer ${paidApiKey}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
});

test("closes instead of forwarding unsupported input transcription config", async ({
    paidApiKey,
}) => {
    await expectClientEventRejected(paidApiKey, {
        type: "session.update",
        session: {
            input_audio_transcription: { model: "gpt-4o-transcribe" },
        },
    });
});

test("closes instead of forwarding transcription session client events", async ({
    paidApiKey,
}) => {
    await expectClientEventRejected(paidApiKey, {
        type: "transcription_session.update",
        session: { turn_detection: null },
    });
});

test("closes instead of forwarding transcription session type updates", async ({
    paidApiKey,
}) => {
    await expectClientEventRejected(paidApiKey, {
        type: "session.update",
        session: { type: "transcription" },
    });
});

test("closes instead of forwarding nested transcription session config", async ({
    paidApiKey,
}) => {
    await expectClientEventRejected(paidApiKey, {
        type: "session.update",
        session: {
            audio: {
                input: {
                    transcription: { model: "gpt-realtime-whisper" },
                },
            },
        },
    });
});

test("closes instead of forwarding client input transcription events", async ({
    paidApiKey,
}) => {
    await expectClientEventRejected(paidApiKey, {
        type: "conversation.item.input_audio_transcription.delta",
        delta: "hello",
    });
});

test("closes instead of forwarding upstream input transcription events", async () => {
    const session = await openPaidRealtimeSession({
        name: "upstream-transcription-realtime-key",
    });

    let clientReceived = false;
    session.client.addEventListener("message", () => {
        clientReceived = true;
    });

    const closeEvent = nextClose(session.client);
    session.upstream.server.send(
        JSON.stringify({
            type: "conversation.item.input_audio_transcription.delta",
            usage: { input_tokens: 10 },
        }),
    );

    await expect(closeEvent).resolves.toMatchObject({
        code: 1008,
        reason: "Realtime input transcription is not supported yet.",
    });
    expect(clientReceived).toBe(false);
    session.upstream.server.close();
    await waitForTinybirdRequests(session.upstream);
    await waitOnExecutionContext(session.ctx);

    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeLessThan(1);
    expect(session.upstream.tinybirdRequests).toHaveLength(1);
    const telemetry = JSON.parse(
        await session.upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
    expect(telemetry.tokenCountPromptText).toBe(10);
});

test("deducts aggregate session usage from paid pack balance on close", async () => {
    const session = await openPaidRealtimeSession({
        name: "paid-budgeted-realtime-key",
    });

    const usageEvent = JSON.stringify({
        type: "response.done",
        response: {
            usage: {
                input_tokens: 135,
                output_tokens: 75,
                input_token_details: {
                    text_tokens: 100,
                    audio_tokens: 10,
                    image_tokens: 5,
                    cached_tokens: 20,
                    cached_tokens_details: {
                        text_tokens: 20,
                        audio_tokens: 0,
                        image_tokens: 0,
                    },
                },
                output_token_details: {
                    text_tokens: 50,
                    audio_tokens: 25,
                },
            },
        },
    });

    session.upstream.server.send(usageEvent);
    session.upstream.server.send(usageEvent);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session.upstream.tinybirdRequests).toHaveLength(0);

    const telemetry = await closeAndReadTelemetry(session);
    const user = await waitForPackBalanceBelow(session.userId, 1);

    const expectedCharge = 0.003553 * 2 * 0.75;
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.eventType).toBe("generate.realtime");
    expect(telemetry.responseStatus).toBe(200);
    expect(telemetry.resolvedModelRequested).toBe("gpt-realtime-2");
    expect(telemetry.modelProviderUsed).toBe("azure");
    expect(telemetry.tokenCountPromptText).toBe(200);
    expect(telemetry.tokenCountPromptCached).toBe(40);
    expect(telemetry.tokenCountPromptAudio).toBe(20);
    expect(telemetry.tokenCountPromptImage).toBe(10);
    expect(telemetry.tokenCountCompletionText).toBe(100);
    expect(telemetry.tokenCountCompletionAudio).toBe(50);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 8);
});

test.each([
    "gpt-realtime-2",
    "gpt-realtime-2.1",
] as const)("bills %s cached image tokens at $0.50/M", async (model) => {
    const session = await openPaidRealtimeSession({
        name: `${model}-cache-realtime-key`,
        model,
    });

    for (let eventCount = 0; eventCount < 2; eventCount++) {
        const forwardedEvent = nextMessage(session.client);
        session.upstream.server.send(cachedModalityUsageEvent);
        await expect(forwardedEvent).resolves.toBe(cachedModalityUsageEvent);
    }

    const telemetry = await closeAndReadTelemetry(session);

    const expectedCost = 0.0023975 * 2;
    const expectedCharge = expectedCost * 0.75;
    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.resolvedModelRequested).toBe(model);
    expect(telemetry.tokenCountPromptText).toBe(60);
    expect(telemetry.tokenCountPromptCached).toBe(60);
    expect(telemetry.tokenCountPromptAudio).toBe(70);
    expect(telemetry.tokenCountPromptImage).toBe(10);
    expect(telemetry.tokenCountCompletionText).toBe(40);
    expect(telemetry.tokenCountCompletionAudio).toBe(20);
    expect(telemetry.adjustmentUnits).toEqual({
        "openai.realtime.cached_image_delta.v1": 10,
    });
    const adjustmentCosts = telemetry.adjustmentCosts as Record<string, number>;
    expect(
        adjustmentCosts["openai.realtime.cached_image_delta.v1"],
    ).toBeCloseTo(0.000001, 12);
    expect(telemetry.totalCost).toBeCloseTo(expectedCost, 10);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 10);
});

test("bills mini cached audio and image tokens at their exact rates", async () => {
    const session = await openPaidRealtimeSession({
        name: "mini-cache-realtime-key",
        model: "gpt-realtime-2.1-mini",
    });

    for (let eventCount = 0; eventCount < 2; eventCount++) {
        const forwardedEvent = nextMessage(session.client);
        session.upstream.server.send(cachedModalityUsageEvent);
        await expect(forwardedEvent).resolves.toBe(cachedModalityUsageEvent);
    }

    const telemetry = await closeAndReadTelemetry(session);

    const expectedCost = 0.0006255 * 2;
    const expectedCharge = 0.00093825;
    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.tokenCountPromptText).toBe(60);
    expect(telemetry.tokenCountPromptCached).toBe(60);
    expect(telemetry.tokenCountPromptAudio).toBe(70);
    expect(telemetry.tokenCountPromptImage).toBe(10);
    expect(telemetry.tokenCountCompletionText).toBe(40);
    expect(telemetry.tokenCountCompletionAudio).toBe(20);
    expect(telemetry.adjustmentUnits).toEqual({
        "openai.realtime.cached_audio_delta.v1": 30,
        "openai.realtime.cached_image_delta.v1": 10,
    });
    const adjustmentCosts = telemetry.adjustmentCosts as Record<string, number>;
    expect(
        adjustmentCosts["openai.realtime.cached_audio_delta.v1"],
    ).toBeCloseTo(0.0000072, 12);
    expect(
        adjustmentCosts["openai.realtime.cached_image_delta.v1"],
    ).toBeCloseTo(0.0000002, 12);
    expect(telemetry.totalCost).toBeCloseTo(expectedCost, 10);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 10);
});

test("uses the cached-text rate when cache details are absent", async () => {
    const session = await openPaidRealtimeSession({
        name: "mini-missing-cache-details-key",
        model: "gpt-realtime-2.1-mini",
    });

    const warn = vi.spyOn(getLogger(["hono", "realtime"]), "warn");
    const usageEvent = JSON.stringify({
        type: "response.done",
        response: {
            usage: {
                input_tokens: 100,
                output_tokens: 10,
                input_token_details: {
                    text_tokens: 100,
                    cached_tokens: 30,
                },
                output_token_details: { text_tokens: 10 },
            },
        },
    });
    const firstForwardedEvent = nextMessage(session.client);
    session.upstream.server.send(usageEvent);
    await expect(firstForwardedEvent).resolves.toBe(usageEvent);
    const secondForwardedEvent = nextMessage(session.client);
    session.upstream.server.send(usageEvent);
    await expect(secondForwardedEvent).resolves.toBe(usageEvent);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
        "Realtime cached token modality details are missing or incomplete; unmatched cached tokens use the cached-text rate: model={model}",
        { model: "gpt-realtime-2.1-mini" },
    );

    const telemetry = await closeAndReadTelemetry(session);

    const expectedCost = 0.0000678 * 2;
    const expectedCharge = 0.00005085 * 2;
    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.tokenCountPromptText).toBe(140);
    expect(telemetry.tokenCountPromptCached).toBe(60);
    expect(telemetry.tokenCountCompletionText).toBe(20);
    expect(telemetry.adjustmentUnits).toBeUndefined();
    expect(telemetry.totalCost).toBeCloseTo(expectedCost, 10);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 10);
});

test("falls back to aggregate realtime token totals when details are absent", async () => {
    const session = await openPaidRealtimeSession({
        name: "aggregate-only-realtime-key",
    });

    session.upstream.server.send(
        JSON.stringify({
            type: "response.done",
            response: {
                usage: {
                    input_tokens: 20,
                    output_tokens: 5,
                },
            },
        }),
    );

    const telemetry = await closeAndReadTelemetry(session);

    const expectedCharge = 0.0002 * 0.75;
    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.tokenCountPromptText).toBe(20);
    expect(telemetry.tokenCountCompletionText).toBe(5);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 8);
});

test("bills partial realtime token details from aggregate remainders", async () => {
    const session = await openPaidRealtimeSession({
        name: "partial-detail-realtime-key",
    });

    session.upstream.server.send(
        JSON.stringify({
            type: "response.done",
            response: {
                usage: {
                    input_tokens: 135,
                    output_tokens: 75,
                    input_token_details: {
                        audio_tokens: 10,
                        image_tokens: 5,
                        cached_tokens: 20,
                    },
                    output_token_details: {
                        text_tokens: 50,
                        audio_tokens: 20,
                    },
                },
            },
        }),
    );

    const telemetry = await closeAndReadTelemetry(session);

    const expectedCharge = 0.003353 * 0.75;
    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(telemetry.tokenCountPromptText).toBe(100);
    expect(telemetry.tokenCountPromptCached).toBe(20);
    expect(telemetry.tokenCountPromptAudio).toBe(10);
    expect(telemetry.tokenCountPromptImage).toBe(5);
    expect(telemetry.tokenCountCompletionText).toBe(55);
    expect(telemetry.tokenCountCompletionAudio).toBe(20);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 8);
});

test("redacts credential query parameters from realtime referrer telemetry", async () => {
    const session = await openPaidRealtimeSession({
        name: "referrer-redaction-realtime-key",
        referrer:
            "https://app.example/call?key=pk_secret&token=t&api_key=a&access_token=b&apikey=c&bearerToken=d&ok=1",
    });

    session.upstream.server.send(
        JSON.stringify({
            type: "response.done",
            response: { usage: { input_tokens: 1, output_tokens: 1 } },
        }),
    );

    const telemetry = await closeAndReadTelemetry(session);
    expect(telemetry.referrerDomain).toBe("app.example");
    expect(telemetry.referrerUrl).toBe(
        "https://app.example/call?key=%5Bredacted%5D&token=%5Bredacted%5D&api_key=%5Bredacted%5D&access_token=%5Bredacted%5D&apikey=%5Bredacted%5D&bearerToken=%5Bredacted%5D&ok=1",
    );
});

test("omits invalid realtime referrers instead of storing raw credential strings", async () => {
    const session = await openPaidRealtimeSession({
        name: "invalid-referrer-realtime-key",
        referrer: "not a url?key=pk_secret&token=t",
    });

    session.upstream.server.send(
        JSON.stringify({
            type: "response.done",
            response: { usage: { input_tokens: 1, output_tokens: 1 } },
        }),
    );

    const telemetry = await closeAndReadTelemetry(session);
    expect(telemetry.referrerUrl).toBeUndefined();
    expect(telemetry.referrerDomain).toBeUndefined();
});

test("includes realtime model in OpenAI-compatible model discovery", async ({
    restrictedApiKey,
}) => {
    const publicResponse = await fetchWorker("/v1/models");
    expect(publicResponse.status).toBe(200);
    const publicBody = (await publicResponse.json()) as {
        data: { id: string; supported_endpoints?: string[] }[];
    };
    const realtimeModels = publicBody.data.filter((model) =>
        [
            "gpt-realtime-2",
            "gpt-realtime-2.1",
            "gpt-realtime-2.1-mini",
        ].includes(model.id),
    );
    expect(realtimeModels).toHaveLength(3);
    for (const model of realtimeModels) {
        expect(model.supported_endpoints).toContain("/v1/realtime");
    }
    expect(
        publicBody.data.find((model) => model.id === "scribe-realtime"),
    ).toMatchObject({
        supported_endpoints: ["/v1/audio/transcriptions/realtime"],
    });

    const richResponse = await fetchWorker("/models");
    expect(richResponse.status).toBe(200);
    const richModels = (await richResponse.json()) as {
        name: string;
        brand?: string;
        title?: string;
        description?: string;
        input_modalities?: string[];
        output_modalities?: string[];
        supported_endpoints?: string[];
        paid_only?: boolean;
        aliases?: string[];
        pricing?: Record<string, string>;
    }[];
    const scribeRealtime = richModels.find(
        (model) => model.name === "scribe-realtime",
    );
    expect(scribeRealtime).toMatchObject({
        aliases: [],
        brand: "ElevenLabs",
        title: "Scribe v2 Realtime",
        input_modalities: ["audio"],
        output_modalities: ["text"],
        supported_endpoints: ["/v1/audio/transcriptions/realtime"],
        paid_only: true,
        pricing: {
            currency: "pollen",
            promptAudioSeconds: "0.000108333333",
        },
    });
    expect(scribeRealtime?.description?.toLowerCase()).not.toContain(
        scribeRealtime?.title?.toLowerCase(),
    );

    const restrictedResponse = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });
    expect(restrictedResponse.status).toBe(200);
    const restrictedBody = (await restrictedResponse.json()) as {
        data: { id: string }[];
    };
    expect(restrictedBody.data.map((model) => model.id)).not.toContain(
        "gpt-realtime-2",
    );
    expect(restrictedBody.data.map((model) => model.id)).not.toContain(
        "gpt-realtime-2.1",
    );
    expect(restrictedBody.data.map((model) => model.id)).not.toContain(
        "gpt-realtime-2.1-mini",
    );
    expect(restrictedBody.data.map((model) => model.id)).not.toContain(
        "scribe-realtime",
    );
});

test("rejects realtime access for empty model permissions", async () => {
    const { key } = await createTestApiKey({
        allowedModels: [],
        user: { packBalance: 1 },
    });
    const response = await fetchWorker("/v1/realtime?model=gpt-realtime-2", {
        headers: {
            Authorization: `Bearer ${key}`,
            Upgrade: "websocket",
        },
    });

    expect(response.status).toBe(403);
});
