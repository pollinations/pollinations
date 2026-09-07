import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableFallbackError } from "../../src/fallback.ts";
import { createChatStreamUsageValidator } from "../../src/text/chat/usage.js";
import { genericOpenAIClient } from "../../src/text/genericOpenAIClient.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("genericOpenAIClient", () => {
    it("keeps an embedded quota error retryable when diagnostics echo moderation words", async () => {
        const responseBody = JSON.stringify({
            error: {
                message: "Provider rate limited",
                code: 429,
                details: { diagnostic: "quota reached" },
            },
            request: { prompt: "Explain the NSFW label" },
        });
        const fetcher = vi.fn(async () => new Response(responseBody));
        const error = await genericOpenAIClient(
            [{ role: "user", content: "test" }],
            { model: "test-model" },
            { endpoint: "https://provider.test/chat", fetcher },
        ).catch((error) => error);
        expect(error).toMatchObject({
            status: 502,
            upstreamStatus: 429,
            responseBody,
        });
        expect(isRetryableFallbackError(error)).toBe(true);
    });

    it.each([
        200, 429,
    ])("retains the complete raw provider envelope at HTTP %s", async (status) => {
        const rawBody = JSON.stringify(
            {
                error: {
                    message: "Provider unavailable",
                    code: 429,
                    details: { diagnostic: "inner detail" },
                },
                providerTrace: {
                    token: "provider-test-token",
                    data: "x".repeat(20000),
                },
            },
            null,
            2,
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(rawBody, { status }),
        );
        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "test" }],
                { model: "test-model" },
                { endpoint: "https://provider.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            upstreamStatus: 429,
            responseBody: rawBody,
        });
    });

    it("retains malformed successful response bodies for diagnostics", async () => {
        const rawBody = "<html>upstream gateway failure</html>";
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(rawBody));
        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "test" }],
                { model: "test-model" },
                { endpoint: "https://provider.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            upstreamStatus: 200,
            responseBody: rawBody,
        });
    });

    it("reports Portkey's exhausted deadline as 504 without starting a fallback", async () => {
        const details = {
            error: {
                type: "timeout_error",
                message:
                    "Request exceeded the timeout sent in the request: 290000ms",
            },
        };
        const fetcher = vi.fn(async () =>
            Response.json(details, { status: 408 }),
        );
        const failure = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat", fetcher },
        ).catch((error) => error);
        expect(failure).toMatchObject({
            status: 504,
            upstreamStatus: 408,
            details,
        });
        expect(isRetryableFallbackError(failure)).toBe(false);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("uses a configured service-binding fetcher", async () => {
        const fetcher = vi.fn(async () =>
            Response.json({
                model: "provider-model",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "ok" },
                        finish_reason: "stop",
                    },
                ],
            }),
        );
        const globalFetch = vi
            .spyOn(globalThis, "fetch")
            .mockRejectedValue(new Error("unexpected public fetch"));

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            {
                endpoint: "https://portkey.myceli.ai/v1/chat/completions",
                fetcher,
            },
        );

        expect(fetcher).toHaveBeenCalledOnce();
        expect(fetcher).toHaveBeenCalledWith(
            "https://portkey.myceli.ai/v1/chat/completions",
            expect.objectContaining({ method: "POST" }),
        );
        expect(globalFetch).not.toHaveBeenCalled();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });

    it("normalizes provider stop to length at the configured token limit", async () => {
        let upstreamBody: Record<string, unknown> | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                upstreamBody = JSON.parse(String(init?.body));
                return Response.json({
                    model: "provider-model",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "truncated",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 3,
                        completion_tokens: 1,
                        total_tokens: 4,
                    },
                });
            },
        );

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "write several words" }],
            {
                model: "provider-model",
                max_tokens: 1,
                normalizeFinishReasonAtTokenLimit: true,
            },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(completion.choices?.[0]?.finish_reason).toBe("length");
        expect(upstreamBody).not.toHaveProperty(
            "normalizeFinishReasonAtTokenLimit",
        );
    });

    it("does not send internal gateway options in the upstream JSON body", async () => {
        let upstreamBody: Record<string, unknown> | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (input, init) => {
                expect(input).toBe("https://portkey.test/chat");
                expect(init?.signal).toBeUndefined();
                expect(new Headers(init?.headers).get("authorization")).toBe(
                    "Bearer secret",
                );
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

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: { provider: "azure-openai" },
                modelDef: { name: "openai-fast" },
                requestedModel: "openai-fast",
                userApiKey: "sk_should_not_leak",
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
        expect(upstreamBody).not.toHaveProperty("modelConfig");
        expect(upstreamBody).not.toHaveProperty("modelDef");
        expect(upstreamBody).not.toHaveProperty("portkeyGatewayUrl");
        expect(upstreamBody).not.toHaveProperty("requestedModel");
        expect(upstreamBody).not.toHaveProperty("userApiKey");
        expect(completion.upstreamRequestUrl?.href).toBe(
            "https://portkey.test/chat",
        );
        expect(
            Object.prototype.propertyIsEnumerable.call(
                completion,
                "upstreamRequestUrl",
            ),
        ).toBe(false);
        expect(JSON.stringify({ ...completion })).not.toContain(
            "upstreamRequestUrl",
        );
    });

    it("strips top-level null options while preserving nested provider payloads", async () => {
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
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                });
            },
        );

        await genericOpenAIClient(
            [
                {
                    role: "assistant",
                    tool_calls: [{ id: "call_1", type: "function" }],
                    content: null,
                    provider_message_option: "kept",
                },
            ],
            {
                model: "provider-model",
                audio: null as unknown as Record<string, unknown>,
                modalities: null as unknown as string[],
                response_format: null as unknown as { type: string },
                stream_options: null as unknown as Record<string, unknown>,
                temperature: null as unknown as number,
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "lookup",
                            parameters: {
                                type: "object",
                                properties: {
                                    value: { type: "string", default: null },
                                },
                            },
                        },
                    },
                ],
            },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(upstreamBody).toEqual({
            model: "provider-model",
            messages: [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [{ id: "call_1", type: "function" }],
                    provider_message_option: "kept",
                },
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "lookup",
                        parameters: {
                            type: "object",
                            properties: {
                                value: { type: "string", default: null },
                            },
                        },
                    },
                },
            ],
        });
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
                { role: "user", name: "", content: "empty" },
                {
                    role: "user",
                    name: 42 as unknown as string,
                    content: "number",
                },
                {
                    role: "user",
                    name: { value: "tool" } as unknown as string,
                    content: "object",
                },
                { role: "user", name: "foo.bar", content: "dot" },
                { role: "assistant", name: "a@b", content: "at" },
                { role: "system", name: "a".repeat(65), content: "long" },
            ],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(upstreamBody?.messages).toEqual([
            { role: "user", name: "valid_name-1", content: "hello" },
            { role: "user", content: "empty" },
            { role: "user", content: "number" },
            { role: "user", content: "object" },
            { role: "user", content: "dot" },
            { role: "assistant", content: "at" },
            { role: "system", content: "long" },
        ]);
    });

    it("preserves valid semantic tool and function message names", async () => {
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
                {
                    role: "tool",
                    name: "lookup_weather",
                    tool_call_id: "call_1",
                    content: "{}",
                },
                { role: "function", name: "legacy_lookup", content: "{}" },
            ],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(upstreamBody?.messages).toEqual([
            {
                role: "tool",
                name: "lookup_weather",
                tool_call_id: "call_1",
                content: "{}",
            },
            { role: "function", name: "legacy_lookup", content: "{}" },
        ]);
    });

    it("rejects invalid semantic tool and function message names", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            genericOpenAIClient(
                [{ role: "function", name: "legacy.lookup", content: "{}" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 400 });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("maps upstream 429 to 502 while preserving upstream status", async () => {
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
        ).rejects.toMatchObject({ status: 502, upstreamStatus: 429 });
    });

    it("maps an unsupported image URL format to a client error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        message:
                            "Unsupported image format for URL: https://example.com/video.mp4",
                    },
                },
                { status: 415, statusText: "Unsupported Media Type" },
            ),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 415, upstreamStatus: 415 });
    });

    it("maps unsupported multimodal input errors to a client error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        message: "Provider returned error",
                        metadata: {
                            raw: "No endpoints found that support image input",
                        },
                    },
                },
                { status: 404, statusText: "Not Found" },
            ),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 400, upstreamStatus: 404 });
    });

    it.each([
        "Multimodal processing failed: image decode error",
        '{"error":{"message":"Invalid or unsupported audio file."}}',
    ])("maps malformed media errors to a client error: %s", async (message) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        message: "Provider returned error",
                        metadata: { raw: message },
                    },
                },
                { status: 500, statusText: "Internal Server Error" },
            ),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 400, upstreamStatus: 500 });
    });

    it.each([
        "status",
        "code",
    ])("maps 429 from an upstream error envelope's %s to 502", async (field) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                error: {
                    message: "rate limited",
                    [field]: 429,
                },
            }),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 502, upstreamStatus: 429 });
    });

    it.each([
        [200, false],
        [200, true],
        [400, false],
        [403, false],
        [500, false],
    ])("returns a non-retryable 4xx for policy rejection (HTTP %s, choice error %s)", async (status, nested) => {
        const details = {
            code: 400,
            message: "Gemini blocked the request: PROHIBITED_CONTENT",
            metadata: { error_type: "invalid_request" },
        };
        const body = nested
            ? { choices: [{ finish_reason: "error", error: details }] }
            : { error: details };
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(body, { status }),
        );
        const error = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        ).catch((error) => error);
        expect(error).toMatchObject({
            status: 422,
            upstreamStatus: status === 200 ? 400 : status,
            details: status === 200 ? details : body,
        });
        expect(isRetryableFallbackError(error)).toBe(false);
    });

    it.each([
        401, 402, 403, 429, 503,
    ])("keeps provider error.code=%s eligible for fallback", async (code) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                error: { code, message: "Provider unavailable" },
            }),
        );
        const error = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        ).catch((error) => error);
        expect(error).toMatchObject({ upstreamStatus: code });
        expect(isRetryableFallbackError(error)).toBe(true);
    });

    it.each([
        200, 1001,
    ])("does not use non-error HTTP code %s as the response status", async (code) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({ error: { code, message: "Provider failed" } }),
        );
        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("maps an embedded completion 429 to a retryable upstream error", async () => {
        const details = {
            code: 429,
            message: "Provider rate limited",
            metadata: { error_type: "rate_limit_exceeded" },
        };
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                choices: [
                    {
                        finish_reason: "error",
                        error: details,
                    },
                ],
            }),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            upstreamStatus: 429,
            details,
        });
    });

    it("leaves non-rate-limit completion errors unchanged", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                choices: [
                    {
                        finish_reason: "error",
                        error: {
                            code: 400,
                            message: "Malformed function call",
                        },
                    },
                ],
            }),
        );

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(completion.choices?.[0]).toMatchObject({
            finish_reason: "error",
            error: { code: 400 },
        });
    });

    it.each([
        '{"error":{"message":"Failed to load image: cannot identify image file","code":400}}',
        '{"error":{"message":"Invalid or unsupported audio file.","code":400}}',
    ])("maps malformed media in a successful error envelope to 400: %s", async (message) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({ error: { message } }),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("maps invalid upstream JSON to 502 with gateway context", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("not json"),
        );

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            requestUrl: new URL("https://portkey.test/chat"),
        });
    });

    it("normalizes choices without mutating frozen upstream objects", async () => {
        const frozenChoice = Object.freeze({
            message: { tool_calls: [{}] },
            finish_reason: "stop",
        });
        const rawBody = JSON.stringify({ choices: [frozenChoice] });
        const parse = JSON.parse;
        vi.spyOn(JSON, "parse").mockImplementation((text, reviver) =>
            text === rawBody
                ? { choices: [frozenChoice] }
                : parse(text, reviver),
        );
        const response = new Response(rawBody);
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(completion.choices?.[0]?.finish_reason).toBe("tool_calls");
        expect(frozenChoice.finish_reason).toBe("stop");
    });

    it("preserves and normalizes every upstream choice and extension", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "chatcmpl_multi",
                object: "chat.completion",
                provider_response_option: { trace: "kept" },
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "first" },
                        finish_reason: "stop",
                        provider_choice_option: "first-kept",
                    },
                    {
                        index: 1,
                        message: {
                            role: "assistant",
                            content: null,
                            tool_calls: [{ id: "call_1" }],
                        },
                        finish_reason: "stop",
                        provider_choice_option: "second-kept",
                    },
                ],
                usage: { completion_tokens: 5 },
            }),
        );

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                max_tokens: 5,
                normalizeFinishReasonAtTokenLimit: true,
            },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(completion.provider_response_option).toEqual({ trace: "kept" });
        expect(completion.choices).toHaveLength(2);
        expect(completion.choices?.[0]).toMatchObject({
            finish_reason: "length",
            provider_choice_option: "first-kept",
        });
        expect(completion.choices?.[1]).toMatchObject({
            finish_reason: "tool_calls",
            provider_choice_option: "second-kept",
        });
    });

    it("preserves non-Error transport failures as the cause", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce("socket closed");

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model" },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            cause: "socket closed",
            requestUrl: new URL("https://portkey.test/chat"),
        });
    });

    it("passes through successful empty completions", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "chatcmpl_test",
                object: "chat.completion",
                model: "provider-model",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "" },
                        finish_reason: "content_filter",
                    },
                ],
                usage: { prompt_tokens: 5, completion_tokens: 0 },
            }),
        );

        const completion = await genericOpenAIClient(
            [{ role: "user", content: "blocked prompt" }],
            { model: "provider-model" },
            { endpoint: "https://portkey.test/chat" },
        );

        expect(completion.choices?.[0]).toMatchObject({
            message: { role: "assistant", content: "" },
            finish_reason: "content_filter",
        });
        expect(completion.usage?.completion_tokens).toBe(0);
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

    it("rejects an empty upstream stream as a retryable failure", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null));

        await expect(
            genericOpenAIClient(
                [{ role: "user", content: "hello" }],
                { model: "provider-model", stream: true },
                { endpoint: "https://portkey.test/chat" },
            ),
        ).rejects.toMatchObject({
            status: 502,
            requestUrl: new URL("https://portkey.test/chat"),
        });
    });
});

describe("Chat Completions stream usage", () => {
    const encoder = new TextEncoder();

    it("accepts valid usage followed by the terminal DONE event", () => {
        const validator = createChatStreamUsageValidator();

        validator.feed(
            encoder.encode(
                'data: {"model":"provider-model","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\ndata: [DONE]\n',
            ),
        );

        expect(() => validator.finish()).not.toThrow();
    });

    it("rejects DONE without valid usage", () => {
        const validator = createChatStreamUsageValidator();

        expect(() =>
            validator.feed(encoder.encode("data: [DONE]\n\n")),
        ).toThrow(/omitted terminal usage/);
    });

    it("keeps early valid usage when later chunks omit it or use null", () => {
        const validator = createChatStreamUsageValidator();
        validator.feed(
            encoder.encode(
                'data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\ndata: {"choices":[]}\n\ndata: {"usage":null}\n\ndata: [DONE]\n\n',
            ),
        );
        expect(() => validator.finish()).not.toThrow();
    });

    it("passes through explicit errors even alongside partial usage", () => {
        const validator = createChatStreamUsageValidator();
        validator.feed(
            encoder.encode(
                'data: {"usage":{"prompt_tokens":2},"error":{"message":"provider failed"}}\n\ndata: [DONE]\n\n',
            ),
        );
        expect(() => validator.finish()).not.toThrow();
    });

    it("rejects a stream that ends before terminal usage", () => {
        const validator = createChatStreamUsageValidator();
        validator.feed(
            encoder.encode(
                'data: {"model":"provider-model","choices":[{"delta":{"content":"ok"}}]}\n\n',
            ),
        );

        expect(() => validator.finish()).toThrow(/without terminal usage/);
    });

    it("accepts an explicit terminal error without usage", () => {
        const validator = createChatStreamUsageValidator();
        validator.feed(
            encoder.encode(
                'data: {"error":{"message":"upstream failed","code":"upstream_error"}}\n\ndata: [DONE]\n\n',
            ),
        );

        expect(() => validator.finish()).not.toThrow();
    });

    it("does not treat an error:null field as a terminal failure", () => {
        const validator = createChatStreamUsageValidator();

        expect(() =>
            validator.feed(
                encoder.encode(
                    'data: {"error":null,"choices":[{"delta":{"content":"partial"}}]}\n\ndata: [DONE]\n\n',
                ),
            ),
        ).toThrow(/omitted terminal usage/);
    });
});
