import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getLogger } from "@logtape/logtape";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import {
    apikey as apiKeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
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

async function nextJsonMessage(socket: WebSocket): Promise<unknown> {
    const message = await nextMessage(socket);
    return typeof message === "string" ? JSON.parse(message) : message;
}

function nextJsonMessages(
    socket: WebSocket,
    count: number,
): Promise<unknown[]> {
    return new Promise((resolve) => {
        const messages: unknown[] = [];
        const onMessage = (event: MessageEvent) => {
            messages.push(
                typeof event.data === "string"
                    ? JSON.parse(event.data)
                    : event.data,
            );
            if (messages.length === count) {
                socket.removeEventListener("message", onMessage);
                resolve(messages);
            }
        };
        socket.addEventListener("message", onMessage);
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
    let upstreamClient: WebSocket | undefined;
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
            upstreamClient = client;
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
        get client() {
            if (!upstreamClient) {
                throw new Error("Expected proxy-side upstream WebSocket");
            }
            return upstreamClient;
        },
        get serverAccepted() {
            return upstreamServerAccepted;
        },
        get maybeServer() {
            return upstreamServer;
        },
    };
}

async function waitForUpstreamServer(
    upstream: ReturnType<typeof mockRealtimeProvider>,
) {
    for (let attempt = 0; attempt < 20; attempt++) {
        if (upstream.maybeServer) return upstream.server;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected upstream realtime WebSocket");
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
    initialProviderMessage,
}: {
    name: string;
    model?: string;
    referrer?: string;
    initialProviderMessage?: string;
}) {
    const {
        key,
        id: apiKeyId,
        userId,
    } = await createTestApiKey({
        name,
        pollenBudget: 1,
        user: { tierBalance: 0, packBalance: 1 },
    });
    const upstream = mockRealtimeProvider(initialProviderMessage);
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
    const initialClientMessage = initialProviderMessage
        ? nextMessage(client)
        : undefined;
    client.accept();
    if (!upstream.serverAccepted) upstream.server.accept();

    return {
        apiKeyId,
        client,
        ctx,
        upstream,
        userId,
        initialClientMessage,
    };
}

async function openPaidScribeSession({
    name,
    path = "/v1/realtime",
}: {
    name: string;
    path?: "/realtime" | "/v1/realtime";
}) {
    const { key, userId } = await createTestApiKey({
        name,
        pollenBudget: 1,
        user: { tierBalance: 0, packBalance: 1 },
    });
    const upstream = mockRealtimeProvider();
    const { response, ctx } = await fetchWorkerWithContext(
        `${path}?model=scribe-realtime`,
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
    const initialClientMessage = nextJsonMessage(client);
    client.accept();

    return { client, ctx, upstream, userId, initialClientMessage };
}

type PaidRealtimeSession = Awaited<ReturnType<typeof openPaidRealtimeSession>>;
type RealtimeSession = Pick<PaidRealtimeSession, "client" | "ctx" | "upstream">;

async function closeRealtimeSession(session: RealtimeSession) {
    session.client.close();
    session.upstream.maybeServer?.close();
    await waitOnExecutionContext(session.ctx);
}

async function closeAndReadTelemetry(session: RealtimeSession) {
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

test("proxies OpenAI-compatible realtime WebSockets on both public routes", async ({
    paidApiKey,
}) => {
    for (const path of ["/realtime", "/v1/realtime"] as const) {
        const upstream = mockRealtimeProvider();

        const { response, ctx } = await fetchWorkerWithContext(path, {
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
        expect(
            upstream.request.headers.get("OpenAI-Safety-Identifier"),
        ).toMatch(/^[a-f0-9]{64}$/);

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
        vi.restoreAllMocks();
    }
});

test("forwards the initial Azure session event after listeners are attached", async () => {
    const initialProviderMessage = JSON.stringify({
        type: "session.created",
        session: { model: "gpt-realtime-2" },
    });
    const session = await openPaidRealtimeSession({
        name: "azure-realtime-initial-event-key",
        initialProviderMessage,
    });

    await expect(session.initialClientMessage).resolves.toBe(
        initialProviderMessage,
    );
    await closeRealtimeSession(session);
});

test("completes both sides of the Azure close handshake", async () => {
    const session = await openPaidRealtimeSession({
        name: "azure-realtime-close-key",
    });
    const clientClose = nextClose(session.client);
    const upstreamClose = nextClose(session.upstream.server);

    session.client.close(1000, "done");

    await expect(clientClose).resolves.toMatchObject({ code: 1000 });
    await expect(upstreamClose).resolves.toMatchObject({ code: 1000 });
    await waitOnExecutionContext(session.ctx);
    expect(session.upstream.tinybirdRequests).toHaveLength(0);
});

test("does not reply to an abnormal Azure close", async () => {
    const session = await openPaidRealtimeSession({
        name: "azure-realtime-abnormal-close-key",
    });
    const closeSpy = vi.spyOn(session.upstream.client, "close");

    session.upstream.client.dispatchEvent(
        new CloseEvent("close", { code: 1006, wasClean: false }),
    );

    await waitOnExecutionContext(session.ctx);
    expect(closeSpy).not.toHaveBeenCalled();
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

test.each([
    "/realtime",
    "/v1/realtime",
] as const)("serves Scribe through the OpenAI protocol on %s", async (path) => {
    const session = await openPaidScribeSession({
        name: `scribe-openai-${path}-key`,
        path,
    });
    await expect(session.initialClientMessage).resolves.toMatchObject({
        type: "session.created",
        session: { type: "transcription" },
    });

    const updated = nextJsonMessage(session.client);
    session.client.send(
        JSON.stringify({
            type: "session.update",
            session: {
                type: "transcription",
                audio: {
                    input: {
                        format: { type: "audio/pcm", rate: 24_000 },
                        transcription: {
                            model: "scribe-realtime",
                            prompt: "contexte",
                            languages: ["fr", "en"],
                        },
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.4,
                            silence_duration_ms: 1500,
                        },
                    },
                },
            },
        }),
    );
    await expect(updated).resolves.toMatchObject({
        type: "session.updated",
        session: {
            type: "transcription",
            audio: {
                input: {
                    transcription: {
                        model: "scribe-realtime",
                        prompt: "contexte",
                        languages: ["fr", "en"],
                    },
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.4,
                        silence_duration_ms: 1500,
                    },
                },
            },
        },
    });

    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(4800),
        }),
    );
    const server = await waitForUpstreamServer(session.upstream);
    server.accept();
    const upstreamMessage = nextMessage(server);
    await expect(upstreamMessage).resolves.toBe(
        JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: zeroAudioBase64(4800),
            previous_text: "contexte",
        }),
    );

    const upstreamUrl = new URL(session.upstream.request.url);
    expect(Object.fromEntries(upstreamUrl.searchParams)).toEqual({
        model_id: "scribe_v2_realtime",
        audio_format: "pcm_24000",
        commit_strategy: "vad",
        language_code: "fr",
        secondary_languages: "en",
        vad_threshold: "0.4",
        vad_silence_threshold_secs: "1.5",
    });
    expect(session.upstream.request.headers.get("xi-api-key")).toBeTruthy();
    expect(session.upstream.request.headers.get("Authorization")).toBeNull();

    const transcriptEvents = nextJsonMessages(session.client, 3);
    server.send(
        JSON.stringify({
            message_type: "partial_transcript",
            text: "bon",
        }),
    );
    server.send(
        JSON.stringify({
            message_type: "partial_transcript",
            text: "bonjour",
        }),
    );
    server.send(
        JSON.stringify({
            message_type: "committed_transcript",
            text: "bonjour",
        }),
    );
    const [firstDelta, secondDelta, completed] = await transcriptEvents;
    expect(firstDelta).toMatchObject({
        type: "conversation.item.input_audio_transcription.delta",
        delta: "bon",
    });
    expect(secondDelta).toMatchObject({
        type: "conversation.item.input_audio_transcription.delta",
        delta: "jour",
    });
    expect(completed).toMatchObject({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "bonjour",
    });

    const telemetry = await closeAndReadTelemetry(session);
    expect(telemetry.requestPath).toBe(path);
    expect(telemetry.tokenCountPromptAudioSeconds).toBeCloseTo(0.1, 8);
});

test("accepts compatible Scribe session updates after streaming starts", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-mid-session-update-key",
    });
    await session.initialClientMessage;

    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(4800),
        }),
    );
    const server = await waitForUpstreamServer(session.upstream);
    server.accept();
    await nextMessage(server);

    const updated = nextJsonMessage(session.client);
    session.client.send(
        JSON.stringify({
            type: "session.update",
            session: {
                type: "transcription",
                audio: {
                    input: {
                        transcription: {
                            model: "scribe-realtime",
                            prompt: "new context",
                        },
                    },
                },
            },
        }),
    );
    await expect(updated).resolves.toMatchObject({
        type: "session.updated",
        session: {
            type: "transcription",
            audio: {
                input: {
                    transcription: {
                        model: "scribe-realtime",
                        prompt: "new context",
                    },
                },
            },
        },
    });

    const contextualAudio = nextMessage(server);
    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(4800),
        }),
    );
    await expect(contextualAudio).resolves.toBe(
        JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: zeroAudioBase64(4800),
            previous_text: "new context",
        }),
    );

    const incompatible = nextJsonMessage(session.client);
    session.client.send(
        JSON.stringify({
            type: "session.update",
            session: {
                audio: {
                    input: {
                        transcription: { languages: ["fr"] },
                    },
                },
            },
        }),
    );
    await expect(incompatible).resolves.toMatchObject({
        type: "error",
        error: {
            type: "invalid_request_error",
            param: "session.audio.input",
        },
    });

    await closeAndReadTelemetry(session);
});

test.each([
    [{ type: "audio/pcm", rate: 24_000 }, "pcm_24000", 48_000],
    [{ type: "audio/pcmu" }, "ulaw_8000", 8000],
] as const)("bills one streamed second of OpenAI %j audio at the exact Scribe rate", async (format, upstreamFormat, bytesPerSecond) => {
    const session = await openPaidScribeSession({
        name: `scribe-realtime-${upstreamFormat}-key`,
    });
    await session.initialClientMessage;
    const updated = nextMessage(session.client);
    session.client.send(
        JSON.stringify({
            type: "session.update",
            session: {
                type: "transcription",
                audio: {
                    input: {
                        format,
                        transcription: { model: "scribe-realtime" },
                        turn_detection: null,
                    },
                },
            },
        }),
    );
    await updated;
    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(bytesPerSecond),
        }),
    );
    const server = await waitForUpstreamServer(session.upstream);
    server.accept();
    await nextMessage(server);
    expect(
        new URL(session.upstream.request.url).searchParams.get("audio_format"),
    ).toBe(upstreamFormat);

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

test("returns OpenAI errors for invalid Scribe events without billing", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-malformed-audio-key",
    });
    await session.initialClientMessage;
    const error = nextJsonMessage(session.client);
    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: "not base64!",
        }),
    );
    await expect(error).resolves.toMatchObject({
        type: "error",
        error: {
            type: "invalid_request_error",
            code: "invalid_value",
        },
    });
    await closeRealtimeSession(session);
    expect(session.upstream.maybeServer).toBeUndefined();
    expect(session.upstream.tinybirdRequests).toHaveLength(0);
    expect((await getUserBalances(session.userId))?.packBalance).toBe(1);
});

test("sanitizes Scribe provider errors and settles accepted audio", async () => {
    const session = await openPaidScribeSession({
        name: "scribe-realtime-provider-error-key",
    });
    await session.initialClientMessage;
    session.client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(48_000),
        }),
    );
    const server = await waitForUpstreamServer(session.upstream);
    server.accept();
    await nextMessage(server);

    const providerError = nextJsonMessage(session.client);
    const clientClose = nextClose(session.client);
    server.send(
        JSON.stringify({
            message_type: "quota_exceeded",
            error: "provider account details",
        }),
    );

    await expect(providerError).resolves.toMatchObject({
        type: "error",
        error: {
            type: "server_error",
            code: "provider_error",
            message: "Realtime transcription failed.",
        },
    });
    await expect(clientClose).resolves.toMatchObject({ code: 1011 });
    await waitOnExecutionContext(session.ctx);
    await waitForTinybirdRequests(session.upstream);
    const telemetry = JSON.parse(
        await session.upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
    expect(telemetry.tokenCountPromptAudioSeconds).toBe(1);
});

test("removes the provider-specific Scribe route and query schema", async () => {
    const { key } = await createTestApiKey({
        name: "scribe-realtime-invalid-query-key",
        user: { packBalance: 1 },
    });
    const upstream = mockRealtimeProvider();
    const removed = await fetchWorker("/v1/audio/transcriptions/realtime", {
        headers: { Authorization: `Bearer ${key}`, Upgrade: "websocket" },
    });
    const providerQuery = await fetchWorker(
        "/v1/realtime?model=scribe-realtime&audio_format=pcm_16000",
        {
            headers: { Authorization: `Bearer ${key}`, Upgrade: "websocket" },
        },
    );

    expect(removed.status).toBe(404);
    expect(providerQuery.status).toBe(400);
    expect(upstream.fetchMock).not.toHaveBeenCalled();
});

test("enforces paid-only and model permissions for Scribe Realtime", async () => {
    mockRealtimeProvider();
    const questOnly = await createTestApiKey({
        name: "scribe-realtime-quest-only-key",
        user: { tierBalance: 1, packBalance: 0 },
    });
    const emptyPermissions = await createTestApiKey({
        name: "scribe-realtime-empty-permissions-key",
        allowedModels: [],
        user: { packBalance: 1 },
    });
    const path = "/v1/realtime?model=scribe-realtime";
    const questResponse = await fetchWorker(path, {
        headers: {
            Authorization: `Bearer ${questOnly.key}`,
            Upgrade: "websocket",
        },
    });
    const permissionResponse = await fetchWorker(path, {
        headers: {
            Authorization: `Bearer ${emptyPermissions.key}`,
            Upgrade: "websocket",
        },
    });

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
        `/v1/realtime?model=scribe-realtime&key=${encodeURIComponent(key)}`,
        { headers: { Upgrade: "websocket" } },
        scribeTestEnv,
    );
    response.webSocket?.accept();
    response.webSocket?.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: zeroAudioBase64(4800),
        }),
    );
    const server = await waitForUpstreamServer(upstream);
    server.accept();
    await nextMessage(server);

    expect(response.status).toBe(101);
    expect(upstream.request.url).not.toContain(key);
    expect(upstream.request.headers.get("xi-api-key")).toBeTruthy();
    const upstreamClose = nextClose(server);
    response.webSocket?.close();
    await upstreamClose;
    await waitOnExecutionContext(ctx);
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

test("does not retry a partially completed realtime deduction", async () => {
    const session = await openPaidRealtimeSession({
        name: "realtime-partial-deduction-key",
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
    const forwardedEvent = nextMessage(session.client);
    session.upstream.server.send(usageEvent);
    await expect(forwardedEvent).resolves.toBe(usageEvent);

    await drizzle(env.DB)
        .delete(apiKeyTable)
        .where(eq(apiKeyTable.id, session.apiKeyId));
    session.client.close();
    await waitOnExecutionContext(session.ctx);

    const user = await waitForPackBalanceBelow(session.userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - 0.003553 * 0.75, 8);
    session.upstream.client.dispatchEvent(new Event("error"));
    await waitOnExecutionContext(session.ctx);
    expect((await getUserBalances(session.userId))?.packBalance).toBeCloseTo(
        user?.packBalance ?? 0,
        8,
    );
    expect(session.upstream.tinybirdRequests).toHaveLength(0);
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
        supported_endpoints: ["/realtime", "/v1/realtime"],
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
        supported_endpoints: ["/realtime", "/v1/realtime"],
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
