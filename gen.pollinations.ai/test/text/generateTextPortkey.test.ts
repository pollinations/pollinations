import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";

const azureModelConfig = {
    provider: "azure-openai",
    "azure-api-key": "test-key",
    "azure-resource-name": "myceli-prod-eastus",
    "azure-deployment-id": "gpt-5.6-luna",
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("generateTextPortkey", () => {
    it("calls OpenRouter directly and preserves its request and response fields", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    expect(String(input)).toBe(
                        "https://openrouter.ai/api/v1/chat/completions",
                    );
                    const headers = new Headers(init?.headers);
                    expect(headers.get("Authorization")).toBe(
                        "Bearer test-openrouter-key",
                    );
                    expect(headers.has("x-portkey-provider")).toBe(false);
                    expect(headers.has("x-portkey-request-timeout")).toBe(
                        false,
                    );
                    expect(JSON.parse(String(init?.body))).toMatchObject({
                        model: "google/gemini-2.5-flash-lite",
                        provider: {
                            only: ["google-vertex/eu"],
                            allow_fallbacks: false,
                        },
                    });

                    return Response.json({
                        id: "generation-1",
                        model: "google/gemini-2.5-flash-lite",
                        provider: "Google",
                        service_tier: null,
                        system_fingerprint: "fp_test",
                        choices: [
                            {
                                index: 0,
                                message: { role: "assistant", content: "ok" },
                                finish_reason: "stop",
                                native_finish_reason: "STOP",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 1,
                            total_tokens: 6,
                            cost: 0.0000009,
                            is_byok: false,
                            prompt_tokens_details: {
                                cached_tokens: 0,
                                cache_write_tokens: 0,
                                audio_tokens: 0,
                                video_tokens: 0,
                            },
                            cost_details: {
                                upstream_inference_cost: 0.0000009,
                                upstream_inference_prompt_cost: 0.0000005,
                                upstream_inference_completions_cost: 0.0000004,
                            },
                            completion_tokens_details: {
                                reasoning_tokens: 0,
                                image_tokens: 0,
                                audio_tokens: 0,
                            },
                        },
                    });
                },
            );
        const portkeyFetcher = vi.fn();

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "gemini-fast",
                portkeyGatewayUrl: "https://portkey.test",
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(completion).toMatchObject({
            id: "generation-1",
            provider: "Google",
            service_tier: null,
            system_fingerprint: "fp_test",
            choices: [{ native_finish_reason: "STOP" }],
            usage: {
                prompt_tokens: 5,
                completion_tokens: 1,
                total_tokens: 6,
                cost: 0.0000009,
                is_byok: false,
                prompt_tokens_details: {
                    cached_tokens: 0,
                    cache_write_tokens: 0,
                    audio_tokens: 0,
                    video_tokens: 0,
                },
                cost_details: {
                    upstream_inference_cost: 0.0000009,
                    upstream_inference_prompt_cost: 0.0000005,
                    upstream_inference_completions_cost: 0.0000004,
                },
                completion_tokens_details: {
                    reasoning_tokens: 0,
                    image_tokens: 0,
                    audio_tokens: 0,
                },
            },
        });
    });

    it("passes OpenRouter streaming responses through unchanged", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
        const upstream =
            'data: {"id":"generation-2","provider":"Google","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n' +
            'data: {"id":"generation-2","provider":"Google","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6,"cost":9e-7}}\n\n' +
            "data: [DONE]\n\n";
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    expect(String(input)).toBe(
                        "https://openrouter.ai/api/v1/chat/completions",
                    );
                    expect(JSON.parse(String(init?.body))).toMatchObject({
                        model: "google/gemini-2.5-flash-lite",
                        stream: true,
                        stream_options: { include_usage: true },
                    });
                    return new Response(upstream, {
                        headers: { "Content-Type": "text/event-stream" },
                    });
                },
            );
        const portkeyFetcher = vi.fn();

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            { model: "gemini-fast", stream: true },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(completion.stream).toBe(true);
        expect(await new Response(completion.responseStream).text()).toBe(
            upstream,
        );
    });

    it("sets an owned request deadline below the public gateway limit", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                expect(headers.get("x-portkey-request-timeout")).toBe("290000");
                expect(headers.get("x-portkey-strict-open-ai-compliance")).toBe(
                    "false",
                );
                expect(JSON.parse(String(init?.body))).not.toHaveProperty(
                    "parallel_tool_calls",
                );

                return Response.json({
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

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: {
                    provider: "openai",
                    model: "provider-model",
                },
                parallel_tool_calls: false,
                portkeyGatewayUrl: "https://portkey.test",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });

    it("preserves seeded GPT-5.6 requests on Chat Completions", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "gpt-5.6-luna",
                    seed: 42,
                });
                return Response.json({
                    choices: [
                        {
                            message: { role: "assistant", content: "ok" },
                        },
                    ],
                });
            },
        );

        await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "gpt-5.6-luna",
                seed: 42,
                modelConfig: azureModelConfig,
                portkeyGatewayUrl: "https://portkey.test",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("routes an unseeded GPT-5.6 request through Azure Responses", async () => {
        const portkeyFetcher = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
                );
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "gpt-5.6-luna",
                });
                return Response.json({
                    id: "resp_1",
                    status: "completed",
                    output: [
                        {
                            type: "message",
                            content: [{ type: "output_text", text: "ok" }],
                        },
                    ],
                });
            });

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "gpt-5.6-luna",
                modelConfig: azureModelConfig,
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });

    it("uses Responses for seeded requests that require tools and reasoning", async () => {
        const portkeyFetcher = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (_input, init) => {
                const body = JSON.parse(String(init?.body));
                expect(body).toMatchObject({
                    model: "gpt-5.6-luna",
                    parallel_tool_calls: false,
                    reasoning: { effort: "max" },
                    tools: [{ type: "function", name: "weather" }],
                });
                expect(body).not.toHaveProperty("seed");
                return Response.json({
                    id: "resp_2",
                    status: "completed",
                    output: [],
                });
            });

        await generateTextPortkey(
            [{ role: "user", content: "weather" }],
            {
                model: "gpt-5.6-luna",
                modelConfig: azureModelConfig,
                seed: 42,
                parallel_tool_calls: false,
                reasoning_effort: "max",
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "weather",
                            parameters: { type: "object" },
                        },
                    },
                ],
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
    });
});
