import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";
import googleCloudAuth from "../src/text/auth/googleCloudAuth.ts";

afterEach(() => vi.restoreAllMocks());

const model = "google/gemini-3.8-live";
const usageMetadata = {
    promptTokenCount: 20,
    candidatesTokenCount: 10,
    totalTokenCount: 30,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 20 }],
    candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 10 }],
};

test.each(["fallback", "missing-usage", "disconnect"])(
    "Gemini Live setup, routing and billing (%s)",
    async (scenario) => {
        const { key } = await createTestApiKey({
            name: "gemini-live",
            pollenBudget: 1,
            user: { packBalance: 1, tierBalance: 0 },
        });
        vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
            "test-token",
        );
        let sendTerminal: () => void;
        const attempts: string[][] = [];
        const telemetry: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (
                    request.url.includes("/v0/events?name=generation_event_v2")
                ) {
                    telemetry.push(await request.json());
                    return new Response(null, { status: 202 });
                }
                if (request.headers.get("Upgrade") !== "websocket")
                    return Response.json({ data: [] });
                const [client, server] = Object.values(new WebSocketPair());
                const frames: string[] = [];
                const primary = attempts.length === 0;
                attempts.push(frames);
                server.addEventListener("message", ({ data }) => {
                    const frame = JSON.parse(String(data));
                    frames.push(
                        frame.realtimeInput?.text ?? Object.keys(frame)[0],
                    );
                    if (frame.setup) {
                        if (primary && scenario === "fallback")
                            server.close(1011, "setup unavailable");
                        else server.send(JSON.stringify({ setupComplete: {} }));
                    } else if (frame.realtimeInput?.text) {
                        server.send(
                            JSON.stringify({
                                serverContent: {
                                    modelTurn: {
                                        parts: [
                                            {
                                                inlineData: {
                                                    mimeType:
                                                        "audio/pcm;rate=24000",
                                                    data: "AAAA",
                                                },
                                            },
                                        ],
                                    },
                                },
                            }),
                        );
                        sendTerminal = () =>
                            server.send(
                                JSON.stringify({
                                    serverContent: { turnComplete: true },
                                    ...(scenario !== "missing-usage" && {
                                        usageMetadata,
                                    }),
                                }),
                            );
                        if (scenario !== "disconnect") sendTerminal();
                    }
                });
                server.accept();
                return new Response(null, { status: 101, webSocket: client });
            },
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                `https://gen.pollinations.ai/v1/realtime?model=${model}`,
                {
                    headers: {
                        Authorization: `Bearer ${key}`,
                        Upgrade: "websocket",
                    },
                },
            ),
            env,
            ctx,
        );
        expect(response.status).toBe(101);
        const client = response.webSocket;
        if (!client) throw new Error("Missing downstream socket");
        const received: string[] = [];
        const closed = new Promise<void>((resolve) =>
            client.addEventListener("close", () => resolve()),
        );
        client.addEventListener("message", ({ data }) => {
            const event = JSON.parse(String(data));
            received.push(event.type);
            if (event.type === "response.done") client.close();
            if (
                scenario === "disconnect" &&
                event.type === "response.output_audio.delta"
            ) {
                client.close();
                setTimeout(sendTerminal, 25);
            }
        });
        client.accept();
        client.send(
            JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "Say hello" }],
                },
            }),
        );
        client.send(JSON.stringify({ type: "response.create" }));
        await closed;
        await waitOnExecutionContext(ctx);
        expect(received).toContain("response.output_audio.delta");
        if (scenario !== "missing-usage") {
            const fallback = scenario === "fallback";
            expect(attempts).toHaveLength(fallback ? 2 : 1);
            if (fallback) expect(attempts[0]).toEqual(["setup"]);
            expect(
                attempts.at(-1)?.filter((frame) => frame === "Say hello"),
            ).toHaveLength(1);
            expect(received.includes("response.done")).toBe(fallback);
            await vi.waitFor(() => expect(telemetry).toHaveLength(1));
            expect(telemetry[0]).toMatchObject({
                modelUsed: fallback ? `${model}:google:us` : model,
                resolvedModelRequested: model,
                fallbackUsed: fallback,
                tokenCountPromptText: 20,
                tokenCountCompletionAudio: 10,
                totalPrice: 0.000135,
            });
        } else {
            expect(attempts).toHaveLength(1);
            expect(attempts[0]).toContain("Say hello");
            expect(received).toContain("error");
            expect(received).not.toContain("response.done");
            expect(telemetry).toHaveLength(0);
        }
    },
);

test("Gemini Live rejects a Quest Pollen balance before upgrading", async () => {
    const { key } = await createTestApiKey({
        name: "gemini-live-quest-only",
        user: { packBalance: 0, tierBalance: 1 },
    });
    const token = vi.spyOn(googleCloudAuth, "getAccessToken");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ data: [] }),
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai/realtime?model=${model}`, {
            headers: { Authorization: `Bearer ${key}`, Upgrade: "websocket" },
        }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(402);
    expect(response.webSocket).toBeNull();
    expect(token).not.toHaveBeenCalled();
});
