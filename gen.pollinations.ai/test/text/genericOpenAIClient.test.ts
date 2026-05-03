import { afterEach, describe, expect, it, vi } from "vitest";
import { genericOpenAIClient } from "../../src/text/genericOpenAIClient.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("genericOpenAIClient", () => {
    it("does not send internal gateway options in the upstream JSON body", async () => {
        let upstreamBody: Record<string, unknown> | undefined;
        let upstreamSignal: AbortSignal | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (input, init) => {
                expect(String(input)).toBe("https://portkey.test/chat");
                upstreamBody = JSON.parse(String(init?.body));
                upstreamSignal = init?.signal as AbortSignal;
                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    model: "provider-model",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "ok",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                });
            },
        );

        await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: { provider: "azure-openai" },
                modelDef: { name: "openai-fast" },
                requestedModel: "openai-fast",
                userApiKey: "sk_should_not_leak",
                userInfo: { userId: "user-1" },
                isPrivate: true,
                referrer: "https://example.com",
                portkeyGatewayUrl: "https://portkey.test",
                additionalHeaders: { Authorization: "Bearer secret" },
                temperature: 1,
            },
            {
                endpoint: "https://portkey.test/chat",
                additionalHeaders: { Authorization: "Bearer secret" },
            },
        );

        expect(upstreamBody).toMatchObject({
            model: "provider-model",
            messages: [{ role: "user", content: "hello" }],
            temperature: 1,
        });
        expect(upstreamBody).not.toHaveProperty("additionalHeaders");
        expect(upstreamBody).not.toHaveProperty("isPrivate");
        expect(upstreamBody).not.toHaveProperty("modelConfig");
        expect(upstreamBody).not.toHaveProperty("modelDef");
        expect(upstreamBody).not.toHaveProperty("portkeyGatewayUrl");
        expect(upstreamBody).not.toHaveProperty("referrer");
        expect(upstreamBody).not.toHaveProperty("requestedModel");
        expect(upstreamBody).not.toHaveProperty("userApiKey");
        expect(upstreamBody).not.toHaveProperty("userInfo");
        expect(upstreamSignal).toBeInstanceOf(AbortSignal);
    });

    it("drops invalid optional message names before sending upstream", async () => {
        let upstreamBody: Record<string, unknown> | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                upstreamBody = JSON.parse(String(init?.body));
                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    model: "provider-model",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "ok",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                });
            },
        );

        await genericOpenAIClient(
            [
                { role: "user", name: "valid_name-1", content: "hello" },
                { role: "user", name: "bad name", content: "again" },
            ],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(upstreamBody?.messages).toEqual([
            { role: "user", name: "valid_name-1", content: "hello" },
            { role: "user", content: "again" },
        ]);
    });

    it("preserves upstream 429 status for callers to back off", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(
                { error: { message: "rate limited" } },
                { status: 429, statusText: "Too Many Requests" },
            ),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("appends a DONE event when an upstream SSE stream omits it", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
            const encoder = new TextEncoder();
            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { content: "ok" },
                                            finish_reason: "stop",
                                        },
                                    ],
                                })}\n\n`,
                            ),
                        );
                        controller.close();
                    },
                }),
                {
                    headers: {
                        "content-type": "text/event-stream; charset=utf-8",
                    },
                },
            );
        });

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                stream: true,
            },
            {
                endpoint: "https://portkey.test/chat",
            },
        );

        const text = await new Response(
            completion.responseStream as ReadableStream,
        ).text();

        expect(text).toContain('"content":"ok"');
        expect(text).toContain("data: [DONE]\n\n");
    });
});
