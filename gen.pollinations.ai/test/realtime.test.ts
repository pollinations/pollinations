import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
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

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

async function fetchWorkerWithContext(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
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

function mockOpenAIRealtime() {
    let upstreamRequest: Request | undefined;
    let upstreamServer: WebSocket | undefined;
    const tinybirdRequests: Request[] = [];

    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const request = new Request(input, init);
            if (request.url.includes("/v0/events?name=generation_event")) {
                tinybirdRequests.push(request);
                return new Response("", { status: 202 });
            }

            upstreamRequest = request;
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair) as [
                WebSocket,
                WebSocket,
            ];
            upstreamServer = server;
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

test("proxies an OpenAI-compatible realtime WebSocket with a paid key", async ({
    paidApiKey,
}) => {
    const upstream = mockOpenAIRealtime();

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
    expect(response.webSocket).toBeDefined();
    expect(upstream.request.url).toBe(
        "https://api.openai.com/v1/realtime?model=gpt-realtime-2",
    );
    expect(upstream.request.headers.get("Upgrade")).toBe("websocket");
    expect(upstream.request.headers.get("Authorization")).toMatch(/^Bearer /);
    expect(upstream.request.headers.get("Authorization")).not.toBe(
        `Bearer ${paidApiKey}`,
    );
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
        session: { model: "gpt-realtime-2" },
    });
    upstream.server.send(serverEvent);
    await expect(downstreamMessage).resolves.toBe(serverEvent);

    client.close();
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
    const upstream = mockOpenAIRealtime();

    const { response, ctx } = await fetchWorkerWithContext(
        `/v1/realtime?model=gpt-realtime-2&key=${encodeURIComponent(key)}`,
        { headers: { Upgrade: "websocket" } },
    );

    expect(response.status).toBe(101);
    expect(upstream.fetchMock).toHaveBeenCalledOnce();
    response.webSocket?.accept();
    upstream.server.accept();
    response.webSocket?.close();
    upstream.server.close();
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

test("deducts aggregate session usage from paid pack balance on close", async () => {
    const { key, userId } = await createTestApiKey({
        name: "paid-budgeted-realtime-key",
        pollenBudget: 1,
        user: { tierBalance: 1000, packBalance: 1 },
    });
    const upstream = mockOpenAIRealtime();

    const { response, ctx } = await fetchWorkerWithContext(
        "/v1/realtime?model=gpt-realtime-2",
        {
            headers: {
                Authorization: `Bearer ${key}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(101);
    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    upstream.server.accept();

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

    upstream.server.send(usageEvent);
    upstream.server.send(usageEvent);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(upstream.tinybirdRequests).toHaveLength(0);

    client.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);

    const user = await waitForPackBalanceBelow(userId, 1);

    const expectedCharge = 0.003473 * 2;
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(user?.tierBalance).toBe(1000);
    expect(upstream.tinybirdRequests).toHaveLength(1);

    const telemetry = JSON.parse(
        await upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
    expect(telemetry.eventType).toBe("generate.realtime");
    expect(telemetry.responseStatus).toBe(200);
    expect(telemetry.resolvedModelRequested).toBe("gpt-realtime-2");
    expect(telemetry.modelProviderUsed).toBe("openai");
    expect(telemetry.tokenCountPromptText).toBe(160);
    expect(telemetry.tokenCountPromptCached).toBe(40);
    expect(telemetry.tokenCountPromptAudio).toBe(20);
    expect(telemetry.tokenCountPromptImage).toBe(10);
    expect(telemetry.tokenCountCompletionText).toBe(100);
    expect(telemetry.tokenCountCompletionAudio).toBe(50);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 8);
});

test("falls back to aggregate realtime token totals when details are absent", async () => {
    const { key, userId } = await createTestApiKey({
        name: "aggregate-only-realtime-key",
        pollenBudget: 1,
        user: { packBalance: 1 },
    });
    const upstream = mockOpenAIRealtime();

    const { response, ctx } = await fetchWorkerWithContext(
        "/v1/realtime?model=gpt-realtime-2",
        {
            headers: {
                Authorization: `Bearer ${key}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(101);
    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    upstream.server.accept();

    upstream.server.send(
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

    client.close();
    upstream.server.close();
    await waitOnExecutionContext(ctx);

    const expectedCharge = 0.0002;
    const user = await waitForPackBalanceBelow(userId, 1);
    expect(user?.packBalance).toBeCloseTo(1 - expectedCharge, 8);
    expect(upstream.tinybirdRequests).toHaveLength(1);

    const telemetry = JSON.parse(
        await upstream.tinybirdRequests[0].text(),
    ) as Record<string, unknown>;
    expect(telemetry.tokenCountPromptText).toBe(20);
    expect(telemetry.tokenCountCompletionText).toBe(5);
    expect(telemetry.totalPrice).toBeCloseTo(expectedCharge, 8);
});

test("includes realtime model in OpenAI-compatible model discovery", async ({
    restrictedApiKey,
}) => {
    const publicResponse = await fetchWorker("/v1/models");
    expect(publicResponse.status).toBe(200);
    const publicBody = (await publicResponse.json()) as {
        data: { id: string; supported_endpoints?: string[] }[];
    };
    const realtimeModel = publicBody.data.find(
        (model) => model.id === "gpt-realtime-2",
    );
    expect(realtimeModel?.supported_endpoints).toContain("/v1/realtime");

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
});
