import { env } from "cloudflare:test";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withModelFallback } from "../../src/fallback.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";
import { syncTextEnvironment } from "../../src/text/environment.ts";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";

const azureModelConfig = {
    provider: "azure-openai",
    "azure-api-key": "test-key",
    "azure-resource-name": "myceli-prod-eastus",
    "azure-deployment-id": "gpt-5.6-luna",
    authKey: "test-key",
    responsesEndpoint:
        "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
    responsesAuthHeader: "api-key",
};

afterEach(() => {
    vi.restoreAllMocks();
    syncTextEnvironment(env);
});

describe("generateTextPortkey", () => {
    it.each([0, 1, 2, 3])(
        "uses the GLM 5.3 chain with %i failed providers",
        async (failures) => {
            const primary = "z-ai/glm-5.3" as const;
            const ids = [primary, ...TEXT_SERVICES[primary].fallbacks];
            const upstreams = [
                "accounts/fireworks/models/glm-5p3",
                "zai-org/GLM-5.3",
                "z-ai/glm-5.3",
            ];
            const attempts: string[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (_input, init) => {
                    const body = JSON.parse(String(init?.body));
                    attempts.push(body.model);
                    if (attempts.length <= failures) {
                        return Response.json(
                            { error: { message: "Capacity exhausted" } },
                            { status: 503 },
                        );
                    }
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: "Hello",
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 1,
                            total_tokens: 11,
                        },
                    });
                },
            );
            const run = withModelFallback(
                ids.map((id) => ({
                    id,
                    definition: TEXT_SERVICES[id as keyof typeof TEXT_SERVICES],
                })),
                ({ id }) =>
                    generateTextPortkey([{ role: "user", content: "Hello" }], {
                        model: id,
                        max_tokens: 128,
                    }),
            );
            if (failures === ids.length) {
                await expect(run).rejects.toThrow();
            } else {
                expect((await run).candidate.id).toBe(ids[failures]);
            }
            expect(attempts).toEqual(
                upstreams.slice(0, Math.min(failures + 1, ids.length)),
            );
        },
    );

    it.each([
        { status: 429, failures: 1 },
        { status: 503, failures: 1 },
        { status: 429, failures: 2 },
        { status: 503, failures: 2 },
    ])(
        "rescues Scout upstream $status after $failures failures at the primary price",
        async ({ status, failures }) => {
            syncTextEnvironment({
                ...env,
                AI_GATEWAY_API_KEY: "test-vercel-key",
            });
            const primary = "meta/llama-4-scout" as const;
            const fallback = TEXT_SERVICES[primary].fallbacks[failures - 1];
            const expectedRoutes = [
                "vercel-deepinfra",
                "deepinfra/fp8/priority",
                "novita/bf16",
            ];
            const routes: string[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const body = JSON.parse(String(init?.body));
                    if (
                        String(input) ===
                        "https://openrouter.ai/api/v1/chat/completions"
                    ) {
                        expect(body.model).toBe("meta-llama/llama-4-scout");
                        expect(body.provider.allow_fallbacks).toBe(false);
                        const route = body.provider.only[0];
                        routes.push(route);
                        expect(route).toBe(expectedRoutes[routes.length - 1]);
                    } else {
                        expect(String(input)).toBe(
                            "https://ai-gateway.vercel.sh/v1/chat/completions",
                        );
                        expect(body.model).toBe("meta/llama-4-scout");
                        expect(body.providerOptions).toEqual({
                            gateway: { only: ["deepinfra"] },
                        });
                        expect(
                            new Headers(init?.headers).get("Authorization"),
                        ).toBe("Bearer test-vercel-key");
                        routes.push("vercel-deepinfra");
                    }
                    if (routes.length <= failures) {
                        return Response.json(
                            { error: { message: "Capacity exhausted" } },
                            { status },
                        );
                    }
                    expect(body.max_tokens).toBe(128);
                    return Response.json({
                        model: "meta-llama/llama-4-scout",
                        choices: [
                            {
                                index: 0,
                                message: { role: "assistant", content: "Red." },
                                finish_reason: "stop",
                            },
                        ],
                        // Images are included in provider prompt_tokens.
                        usage: {
                            prompt_tokens: 167,
                            completion_tokens: 3,
                            total_tokens: 170,
                        },
                    });
                },
            );
            const { result, candidate, index } = await withModelFallback(
                [primary, ...TEXT_SERVICES[primary].fallbacks].map((id) => ({
                    id,
                    definition: TEXT_SERVICES[id as keyof typeof TEXT_SERVICES],
                })),
                ({ id }) =>
                    generateTextPortkey(
                        [{ role: "user", content: "Name the color." }],
                        { model: id, max_tokens: 128 },
                    ),
            );
            expect(routes).toEqual(expectedRoutes.slice(0, failures + 1));
            expect(candidate.id).toBe(fallback);
            expect(index).toBe(failures);
            expect(result.choices?.[0]?.message?.content).toBe("Red.");
            const billing = calculateUsageBilling({
                model: primary,
                usage: openaiUsageToUsage(
                    result.usage as Parameters<typeof openaiUsageToUsage>[0],
                ),
                servedBy: candidate.definition,
                quotedBy: TEXT_SERVICES[primary],
            });
            const [inputRate, outputRate] =
                failures === 1 ? [0.15, 0.45] : [0.18, 0.59];
            expect(billing.cost.totalCost).toBeCloseTo(
                ((167 * inputRate + 3 * outputRate) / 1_000_000) * 1.055,
                12,
            );
            // Customer charges use the ledger's eight-decimal precision.
            expect(billing.price.totalPrice).toBe(0.0000176);
        },
    );

    it("preserves Azure Grok image and additive reasoning accounting", async () => {
        const hosts: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(String(input));
                hosts.push(url.hostname);
                expect(JSON.parse(String(init?.body)).model).toBe("grok-4.6");
                expect(new Headers(init?.headers).has("api-key")).toBe(true);
                return Response.json({
                    model: "grok-4.6",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "Example" },
                            finish_reason: "stop",
                        },
                    ],
                    // Observed Sweden usage: reasoning is additive to completion_tokens.
                    usage: {
                        prompt_tokens: 91,
                        completion_tokens: 22,
                        total_tokens: 353,
                        prompt_tokens_details: {
                            text_tokens: 15,
                            image_tokens: 76,
                        },
                        completion_tokens_details: { reasoning_tokens: 240 },
                    },
                });
            },
        );
        const result = await generateTextPortkey(
            [{ role: "user", content: "Read the image." }],
            { model: "x-ai/grok-4.6" },
        );
        expect(hosts).toEqual([
            "myceli-prod-eastus.cognitiveservices.azure.com",
        ]);
        const usage = openaiUsageToUsage(
            result.usage as Parameters<typeof openaiUsageToUsage>[0],
        );
        expect(usage).toMatchObject({
            promptTextTokens: 15,
            promptImageTokens: 76,
            completionTextTokens: 22,
            completionReasoningTokens: 240,
        });
        const billing = calculateUsageBilling({
            model: "x-ai/grok-4.6",
            usage,
            servedBy: TEXT_SERVICES["x-ai/grok-4.6"],
            quotedBy: TEXT_SERVICES["x-ai/grok-4.6"],
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.001754, 12);
        expect(billing.price.totalPrice).toBe(0.0013155);
    });

    it("falls back from Azure Grok to xAI direct at the primary price", async () => {
        const hosts: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(String(input));
                hosts.push(url.hostname);
                expect(JSON.parse(String(init?.body)).model).toBe("grok-4.6");
                if (url.hostname !== "api.x.ai") {
                    return Response.json(
                        { error: { message: "Capacity exhausted" } },
                        { status: 429 },
                    );
                }
                const headers = new Headers(init?.headers);
                expect(headers.has("api-key")).toBe(false);
                expect(headers.get("authorization")).toBe(
                    `Bearer ${env.XAI_API_KEY}`,
                );
                return Response.json({
                    model: "grok-4.6",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "Paris" },
                            finish_reason: "stop",
                        },
                    ],
                    // Observed xAI usage (2026-09-24): reasoning is additive
                    // and cost_in_usd_ticks reported $0.001296.
                    usage: {
                        prompt_tokens: 648,
                        completion_tokens: 1,
                        total_tokens: 776,
                        prompt_tokens_details: {
                            text_tokens: 648,
                            image_tokens: 0,
                            cached_tokens: 512,
                        },
                        completion_tokens_details: { reasoning_tokens: 127 },
                    },
                });
            },
        );
        const { result, index } = await withModelFallback(
            ["x-ai/grok-4.6", ...TEXT_SERVICES["x-ai/grok-4.6"].fallbacks].map(
                (id) => ({
                    id,
                    definition: TEXT_SERVICES[id as keyof typeof TEXT_SERVICES],
                }),
            ),
            ({ id }) =>
                generateTextPortkey([{ role: "user", content: "Capital?" }], {
                    model: id,
                }),
        );
        expect(index).toBe(1);
        expect(hosts).toEqual([
            "myceli-prod-eastus.cognitiveservices.azure.com",
            "api.x.ai",
        ]);
        const billing = calculateUsageBilling({
            model: "x-ai/grok-4.6",
            usage: openaiUsageToUsage(
                result.usage as Parameters<typeof openaiUsageToUsage>[0],
            ),
            servedBy: TEXT_SERVICES["x-ai/grok-4.6:xai"],
            quotedBy: TEXT_SERVICES["x-ai/grok-4.6"],
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.001296, 12);
        expect(billing.price.totalPrice).toBe(0.000972);
    });

    it("routes Gemini through direct Vertex via Portkey", async () => {
        vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
            "test-google-token",
        );
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const portkeyFetcher = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                expect(String(input)).toBe(
                    "https://portkey.test/v1/chat/completions",
                );
                const headers = new Headers(init?.headers);
                expect(headers.get("x-portkey-provider")).toBe("vertex-ai");
                expect(headers.get("x-portkey-vertex-region")).toBe("global");
                expect(headers.get("x-portkey-vertex-model-id")).toBe(
                    "gemini-3.5-flash-lite",
                );
                expect(headers.get("Authorization")).toBe(
                    "Bearer test-google-token",
                );
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "gemini-3.5-flash-lite",
                });
                return Response.json({
                    id: "generation-1",
                    model: "gemini-3.5-flash-lite",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 5,
                        completion_tokens: 1,
                        total_tokens: 6,
                    },
                });
            },
        );

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "google/gemini-3.5-flash-lite",
                portkeyGatewayUrl: "https://portkey.test",
            },
            portkeyFetcher,
        );

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(portkeyFetcher).toHaveBeenCalledOnce();
        expect(completion).toMatchObject({
            id: "generation-1",
            choices: [{ message: { content: "ok" } }],
            usage: {
                prompt_tokens: 5,
                completion_tokens: 1,
                total_tokens: 6,
            },
        });
    });

    it("falls back from Vercel to the proven OpenRouter AI Studio route", async () => {
        vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
            "test-google-token",
        );
        const primary = "google/gemini-2.5-flash-lite" as const;
        const fallback =
            "google/gemini-2.5-flash-lite:openrouter:ai-studio" as const;
        const portkeyFetcher = vi.fn(async () =>
            Response.json(
                { error: { message: "Vercel unavailable" } },
                { status: 503 },
            ),
        );
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    if (
                        String(input) ===
                        "https://ai-gateway.vercel.sh/v1/chat/completions"
                    ) {
                        expect(JSON.parse(String(init?.body))).toMatchObject({
                            model: "google/gemini-2.5-flash-lite",
                            providerOptions: { gateway: { only: ["google"] } },
                        });
                        return Response.json(
                            { error: { message: "Vercel unavailable" } },
                            { status: 503 },
                        );
                    }
                    expect(String(input)).toBe(
                        "https://openrouter.ai/api/v1/chat/completions",
                    );
                    expect(JSON.parse(String(init?.body))).toMatchObject({
                        model: "google/gemini-2.5-flash-lite",
                        provider: {
                            only: ["google-ai-studio"],
                            allow_fallbacks: false,
                        },
                    });
                    return Response.json({
                        id: "generation-fallback",
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

        const { result, candidate, index } = await withModelFallback(
            [primary, ...TEXT_SERVICES[primary].fallbacks].map((id) => ({
                id,
                definition: TEXT_SERVICES[id as keyof typeof TEXT_SERVICES],
            })),
            ({ id }) =>
                generateTextPortkey(
                    [{ role: "user", content: "hello" }],
                    {
                        model: id,
                        portkeyGatewayUrl: "https://portkey.test",
                    },
                    portkeyFetcher,
                ),
        );

        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(candidate.id).toBe(fallback);
        expect(index).toBe(1);
        expect(result).toMatchObject({
            id: "generation-fallback",
            provider: "Google",
            service_tier: null,
            system_fingerprint: "fp_test",
            choices: [
                {
                    message: { content: "ok" },
                    native_finish_reason: "STOP",
                },
            ],
            usage: {
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

    it("passes OpenRouter fallback streams through unchanged", async () => {
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
            {
                model: "google/gemini-2.5-flash-lite:openrouter:ai-studio",
                stream: true,
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(completion.stream).toBe(true);
        expect(await new Response(completion.responseStream).text()).toBe(
            upstream,
        );
    });

    it.each([undefined, false, true])(
        "sets the request deadline and preserves explicit parallel_tool_calls (%s)",
        async (parallel_tool_calls) => {
            const fetcher = vi.fn(
                async (_input: RequestInfo | URL, init?: RequestInit) => {
                    const headers = new Headers(init?.headers);
                    expect(headers.get("x-portkey-request-timeout")).toBe(
                        "290000",
                    );
                    expect(
                        headers.get("x-portkey-strict-open-ai-compliance"),
                    ).toBe("false");
                    const body = JSON.parse(String(init?.body));
                    expect(body.parallel_tool_calls).toBe(parallel_tool_calls);
                    if (parallel_tool_calls === undefined) {
                        expect(body).not.toHaveProperty("parallel_tool_calls");
                    }

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
                    parallel_tool_calls,
                    portkeyGatewayUrl: "https://portkey.test",
                },
                fetcher,
            );

            expect(fetcher).toHaveBeenCalledOnce();
            expect(completion.choices?.[0]?.message?.content).toBe("ok");
        },
    );

    it("preserves numeric options through the provider pipeline", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "provider-model",
                    stream: false,
                    temperature: 4,
                    top_p: -1,
                    presence_penalty: 3,
                    frequency_penalty: -3,
                    seed: 4.9,
                    response_format: { type: "json_object" },
                });
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

        await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: {
                    provider: "openai",
                    model: "provider-model",
                },
                portkeyGatewayUrl: "https://portkey.test",
                temperature: 4,
                top_p: -1,
                presence_penalty: 3,
                frequency_penalty: -3,
                seed: 4.9,
                jsonMode: true,
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("does not forward the GET voice shortcut to providers", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                expect(JSON.parse(String(init?.body))).not.toHaveProperty(
                    "voice",
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

        await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: { provider: "openai", model: "provider-model" },
                portkeyGatewayUrl: "https://portkey.test",
                voice: "nova",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("still rejects stop for a Responses-backed model", async () => {
        const portkeyFetcher = vi.fn();
        const responsesFetcher = vi.spyOn(globalThis, "fetch");

        let error: unknown;
        try {
            await generateTextPortkey(
                [{ role: "user", content: "hello" }],
                {
                    model: "gpt-5.6-luna",
                    stop: ["END"],
                    modelConfig: azureModelConfig,
                },
                portkeyFetcher,
            );
        } catch (thrown) {
            error = thrown;
        }
        expect(error).toMatchObject({
            status: 400,
            errorCode: "unsupported_parameter",
        });

        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(responsesFetcher).not.toHaveBeenCalled();
    });

    it.each(["openai/gpt-5.6-luna", "gpt-5.6-luna"])(
        "strips sampling before routing %s through Responses",
        async (model) => {
            const portkeyFetcher = vi.fn();
            const fetchSpy = vi
                .spyOn(globalThis, "fetch")
                .mockImplementationOnce(async (input, init) => {
                    expect(String(input)).toBe(
                        "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
                    );
                    const body = JSON.parse(String(init?.body));
                    expect(body).toMatchObject({
                        model: "gpt-5.6-luna",
                        max_output_tokens: 128,
                    });
                    for (const key of [
                        "temperature",
                        "top_p",
                        "seed",
                        "repetition_penalty",
                        "max_tokens",
                        "max_completion_tokens",
                    ]) {
                        expect(body).not.toHaveProperty(key);
                    }
                    return Response.json({
                        id: "resp_1",
                        object: "response",
                        model: "gpt-5.6-luna",
                        status: "completed",
                        output: [
                            {
                                type: "message",
                                content: [{ type: "output_text", text: "ok" }],
                            },
                        ],
                        usage: {
                            input_tokens: 1,
                            output_tokens: 1,
                            total_tokens: 2,
                        },
                    });
                });

            const completion = await generateTextPortkey(
                [{ role: "user", content: "hello" }],
                {
                    model,
                    temperature: 0.7,
                    top_p: 0.9,
                    seed: 42,
                    repetition_penalty: 1.1,
                    max_tokens: 128,
                    modelConfig: azureModelConfig,
                },
                portkeyFetcher,
            );

            expect(fetchSpy).toHaveBeenCalledOnce();
            expect(portkeyFetcher).not.toHaveBeenCalled();
            expect(completion.choices?.[0]?.message?.content).toBe("ok");
        },
    );
});
