import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
    ResponseUsageSchema,
} from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import {
    callDirectResponses,
    type DirectResponsesTarget,
    resolveDirectResponsesTarget,
    responsesTargetFromConfig,
} from "@/text/responses/client.ts";
import { generateCreateResponse } from "@/text/responses/handler.ts";
import {
    buildDirectResponsesRequestBody,
    validateDirectResponsesRequest,
} from "@/text/responses/request.ts";
import {
    createResponsesStreamUsageValidator,
    requireResponsesStreamUsage,
} from "@/text/responses/stream.ts";
import {
    getResponsesEventUsage,
    isResponsesFailure,
    normalizeResponsesTerminalEvent,
} from "@/text/responses/tracking.ts";

const encoder = new TextEncoder();

function request(
    overrides: Partial<CreateResponseRequest> = {},
): CreateResponseRequest {
    return {
        model: "qwen-large",
        input: "Hello",
        stream: false,
        store: false,
        safe: "false",
        ...overrides,
    };
}

function authorizedTarget(
    directRequest: CreateResponseRequest,
): DirectResponsesTarget {
    const target = resolveDirectResponsesTarget("qwen-large", directRequest);
    if (!target) throw new Error("expected direct target");
    return {
        ...target,
        authConfigured: true,
        headers: { Authorization: "Bearer openrouter-test-key" },
    };
}

describe("direct Responses transport", () => {
    it("signs the exact Responses payload for Bedrock without bearer authentication", async () => {
        const target = responsesTargetFromConfig("global.openai.gpt-6-luna", {
            provider: "bedrock",
            responsesEndpoint:
                "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
            "aws-access-key-id": "test-access-key",
            "aws-secret-access-key": "test-secret-key",
            "aws-region": "us-east-1",
            serviceTier: "default",
        });
        if (!target) throw new Error("expected Bedrock target");
        expect(target.authConfigured).toBe(true);
        await callDirectResponses(request(), target, async (url, init) => {
            expect(url).toBe(target.endpoint);
            expect(init?.redirect).toBe("manual");
            const headers = new Headers(init?.headers);
            expect(headers.get("authorization")).toMatch(
                /^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/us-east-1\/bedrock\/aws4_request,/,
            );
            const digest = await crypto.subtle.digest(
                "SHA-256",
                encoder.encode(String(init?.body)),
            );
            expect(headers.get("x-amz-content-sha256")).toBe(
                Array.from(new Uint8Array(digest), (byte) =>
                    byte.toString(16).padStart(2, "0"),
                ).join(""),
            );
            expect(headers.get("api-key")).toBeNull();
            expect(JSON.parse(String(init?.body))).toMatchObject({
                model: "global.openai.gpt-6-luna",
                service_tier: "default",
                store: false,
            });
            return Response.json({});
        });
    });

    it("rejects incomplete AWS credentials before sending a Responses request", async () => {
        const target = responsesTargetFromConfig("global.openai.gpt-6-luna", {
            provider: "bedrock",
            responsesEndpoint:
                "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
            "aws-access-key-id": "test-access-key",
            "aws-region": "us-east-1",
        });
        if (!target) throw new Error("expected Bedrock target");
        const fetcher = vi.fn();
        await expect(
            callDirectResponses(request(), target, fetcher),
        ).rejects.toMatchObject({ status: 500 });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("keeps the GPT-5 Nano backup on Standard for native Responses", () => {
        const input = request({
            model: "openai/gpt-5-nano:openai",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected direct OpenAI target");
        expect(target.endpoint).toBe("https://api.openai.com/v1/responses");
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "gpt-5-nano-2025-08-07",
            service_tier: "default",
            store: false,
        });
    });
    it("keeps gpt-6-astra recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-6-astra:aws",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected AWS Responses target");
        expect(target.endpoint).toBe(
            "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
        );
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "global.openai.gpt-6-astra",
            service_tier: "default",
            store: false,
        });
    });

    it("rejects invalid image URLs on Nex Mini before calling the provider", async () => {
        const directRequest = request({
            model: "nex-agi/nex-n2.5-mini",
            input: [
                null,
                { role: "user", content: { invalid: true } },
                {
                    role: "user",
                    content: [
                        null,
                        {
                            type: "input_image",
                            image_url: "http://127.0.0.1/image.png",
                        },
                    ],
                },
            ],
        });
        const target = resolveDirectResponsesTarget(
            directRequest.model,
            directRequest,
        );
        if (!target) throw new Error("expected direct Nex target");

        await expect(
            callDirectResponses(directRequest, {
                ...target,
                authConfigured: true,
            }),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
    });

    it("keeps gpt-5.4-nano recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.4-nano:openai",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected direct OpenAI target");
        expect(target.endpoint).toBe("https://api.openai.com/v1/responses");
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "gpt-5.4-nano-2026-03-17",
            service_tier: "default",
            store: false,
        });
    });

    it("rejects invalid image URLs on Nex Pro before calling the provider", async () => {
        const directRequest = request({
            model: "nex-agi/nex-n2.5-pro",
            input: [
                null,
                { role: "user", content: { invalid: true } },
                {
                    role: "user",
                    content: [
                        null,
                        {
                            type: "input_image",
                            image_url: "http://127.0.0.1/image.png",
                        },
                    ],
                },
            ],
        });
        const target = resolveDirectResponsesTarget(
            directRequest.model,
            directRequest,
        );
        if (!target) throw new Error("expected direct Nex target");

        await expect(
            callDirectResponses(directRequest, {
                ...target,
                authConfigured: true,
            }),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
    });

    it("keeps gpt-5.6-sol recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.6-sol:aws",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected AWS Responses target");
        expect(target.endpoint).toBe(
            "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
        );
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "global.openai.gpt-5.6-sol",
            service_tier: "default",
            store: false,
        });
    });

    it("preserves the complete raw provider error envelope", async () => {
        const directRequest = request();
        const body = JSON.stringify(
            {
                error: { message: "Rate limited" },
                token: "test-only",
                trace: "x".repeat(20000),
            },
            null,
            2,
        );
        const fetcher = vi.fn(async () => new Response(body, { status: 429 }));
        await expect(
            callDirectResponses(
                directRequest,
                authorizedTarget(directRequest),
                fetcher,
            ),
        ).rejects.toMatchObject({
            status: 502,
            upstreamStatus: 429,
            responseBody: body,
        });
    });

    it("keeps gpt-5.6-luna recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.6-luna:aws",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected AWS Responses target");
        expect(target.endpoint).toBe(
            "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
        );
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "global.openai.gpt-5.6-luna",
            service_tier: "default",
            store: false,
        });
    });

    it("keeps a managed agent's caller-facing status instead of remapping it", async () => {
        const directRequest = request();
        const body = JSON.stringify({
            error: {
                message:
                    "Model 'openai/gpt-5-nano' is not allowed for this API key",
                code: "agent_error",
            },
        });
        const fetcher = vi.fn(async () => new Response(body, { status: 403 }));
        await expect(
            callDirectResponses(
                directRequest,
                {
                    ...authorizedTarget(directRequest),
                    callerFacingStatus: true,
                },
                fetcher,
            ),
        ).rejects.toMatchObject({
            status: 403,
            upstreamStatus: 403,
            message:
                "Model 'openai/gpt-5-nano' is not allowed for this API key",
        });
    });

    it.each([
        ["store", { store: true }],
        ["previous_response_id", { previous_response_id: "resp_previous" }],
        ["conversation", { conversation: "conv_previous" }],
        ["background", { background: true }],
        ["n", { n: 2 }],
    ])("rejects unsupported state or fan-out: %s", (_name, field) => {
        expect(() =>
            CreateResponseRequestSchema.parse({
                model: "qwen-large",
                input: "Hello",
                ...field,
            }),
        ).toThrow();
    });

    it("keeps gpt-5.4 recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.4:aws",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected global AWS target");
        expect(target.endpoint).toBe(
            "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
        );
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "global.openai.gpt-5.4",
            service_tier: "default",
            store: false,
        });
    });

    it("rejects hosted tools without adapting or dropping them", () => {
        expect(() =>
            CreateResponseRequestSchema.parse({
                model: "qwen-large",
                input: "Hello",
                tools: [{ type: "web_search_preview" }],
            }),
        ).toThrow();
    });

    it("keeps gpt-5.4-mini recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.4-mini:openai",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected direct OpenAI target");
        expect(target.endpoint).toBe("https://api.openai.com/v1/responses");
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "gpt-5.4-mini-2026-03-17",
            service_tier: "default",
            store: false,
        });
    });

    it("accepts harmless stateless include and truncation options", () => {
        expect(
            CreateResponseRequestSchema.parse({
                model: "qwen-large",
                input: "Hello",
                include: ["message.output_text.logprobs"],
                truncation: "auto",
            }),
        ).toMatchObject({
            include: ["message.output_text.logprobs"],
            truncation: "auto",
        });
    });

    it("keeps gpt-5.6-terra recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.6-terra:aws",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected AWS Responses target");
        expect(target.endpoint).toBe(
            "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
        );
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "global.openai.gpt-5.6-terra",
            service_tier: "default",
            store: false,
        });
    });

    it("accepts replayed encrypted reasoning but not stored item references", () => {
        const parsed = CreateResponseRequestSchema.parse({
            model: "qwen-large",
            input: [
                {
                    type: "reasoning",
                    summary: [],
                    encrypted_content: "opaque-state",
                },
            ],
            include: ["reasoning.encrypted_content"],
            client_metadata: { session_id: "codex-session" },
        });
        expect(() => validateDirectResponsesRequest(parsed)).not.toThrow();
        const target = resolveDirectResponsesTarget("qwen-large", parsed);
        if (!target) throw new Error("expected direct target");
        const body = buildDirectResponsesRequestBody(parsed, target);
        expect(body).toMatchObject({
            include: ["reasoning.encrypted_content"],
            input: parsed.input,
        });
        expect(body).not.toHaveProperty("client_metadata");

        expect(() =>
            validateDirectResponsesRequest(
                request({
                    input: [{ type: "item_reference", id: "item_123" }],
                }),
            ),
        ).toThrow(/Stored response items/);
    });

    it("keeps gpt-5.3-codex recovery on Standard in native Responses", () => {
        const input = request({
            model: "openai/gpt-5.3-codex:openai",
            service_tier: "priority",
        });
        const target = resolveDirectResponsesTarget(input.model, input);
        if (!target) throw new Error("expected direct OpenAI target");
        expect(target.endpoint).toBe("https://api.openai.com/v1/responses");
        expect(buildDirectResponsesRequestBody(input, target)).toMatchObject({
            model: "gpt-5.3-codex",
            service_tier: "default",
            store: false,
        });
    });

    it("resolves only explicit direct Responses targets", () => {
        expect(resolveDirectResponsesTarget("qwen-large", request())).toEqual(
            expect.objectContaining({
                authConfigured: false,
                endpoint: "https://openrouter.ai/api/v1/responses",
                model: "qwen/qwen3.7-plus",
                defaults: expect.objectContaining({
                    max_output_tokens: 64000,
                    provider: {
                        only: ["Alibaba"],
                        ignore: ["alibaba/us-east-1"],
                        allow_fallbacks: false,
                    },
                }),
            }),
        );
        expect(
            resolveDirectResponsesTarget(
                "step-flash",
                request({ model: "step-flash" }),
            ),
        ).toBeNull();
    });

    it.each([
        ["required", "required", "none"],
        ["function object", { type: "function", name: "lookup" }, "none"],
        ["auto", "auto", "high"],
    ])(
        "normalizes Qwen3.8 Max 0902 reasoning for %s tool choice",
        (_label, toolChoice, expectedEffort) => {
            const directRequest = request({
                model: "qwen/qwen3.8-max-0902",
                reasoning: { effort: "high" },
                tool_choice: toolChoice,
            });
            const target = resolveDirectResponsesTarget(
                directRequest.model,
                directRequest,
            );
            if (!target) throw new Error("expected direct target");

            expect(
                buildDirectResponsesRequestBody(directRequest, target),
            ).toMatchObject({
                reasoning: { effort: expectedEffort },
                tool_choice: toolChoice,
            });
        },
    );

    it("passes Responses JSON directly with only target resolution and defaults", async () => {
        const body = {
            id: "resp_test",
            object: "response",
            model: "qwen/qwen3.7-plus",
            status: "completed",
            output: [],
            usage: {
                input_tokens: 12,
                input_tokens_details: { cached_tokens: 2 },
                output_tokens: 7,
                output_tokens_details: { reasoning_tokens: 3 },
                total_tokens: 19,
            },
        };
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                const upstreamBody = JSON.parse(String(init?.body));
                expect(upstreamBody).toMatchObject({
                    model: "qwen/qwen3.7-plus",
                    input: "Hello",
                    store: false,
                    max_output_tokens: 64000,
                    max_tool_calls: 4,
                    provider: {
                        only: ["Alibaba"],
                        ignore: ["alibaba/us-east-1"],
                        allow_fallbacks: false,
                    },
                    tools: [
                        {
                            type: "function",
                            name: "lookup",
                            parameters: { type: "object" },
                        },
                    ],
                });
                expect(upstreamBody).not.toHaveProperty("messages");
                expect(new Headers(init?.headers).get("Authorization")).toBe(
                    "Bearer openrouter-test-key",
                );
                expect(init?.signal).toBeUndefined();
                expect(init?.redirect).toBe("manual");
                return Response.json(body);
            },
        );
        const directRequest = request({
            max_tool_calls: 4,
            tools: [
                {
                    type: "function",
                    name: "lookup",
                    parameters: { type: "object" },
                },
            ],
        });
        const result = await callDirectResponses(
            directRequest,
            authorizedTarget(directRequest),
            fetcher,
        );
        await expect(result.response.json()).resolves.toEqual(body);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("requires usage in a successful Responses JSON envelope", () => {
        expect(() =>
            CreateResponseResponseSchema.parse({
                id: "resp_without_usage",
                object: "response",
                model: "qwen/qwen3.7-plus",
                status: "completed",
                output: [],
            }),
        ).toThrow();
    });

    it("accepts a failed Responses envelope with null usage", () => {
        expect(
            CreateResponseResponseSchema.parse({
                id: "resp_failed",
                object: "response",
                model: "qwen/qwen3.7-plus",
                status: "failed",
                output: [],
                usage: null,
            }),
        ).toMatchObject({ status: "failed", usage: null });
    });

    it("rejects malformed usage detail fields consumed by billing", () => {
        expect(() =>
            ResponseUsageSchema.parse({
                input_tokens: 12,
                input_tokens_details: { image_tokens: "5" },
                output_tokens: 7,
                total_tokens: 19,
            }),
        ).toThrow();
    });

    it("preserves semantic Responses SSE without a Chat done marker", async () => {
        const upstream =
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n' +
            'event: response.completed\ndata: {"type":"response.completed","response":{"object":"response","model":"qwen/qwen3.7-plus","status":"completed","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n';
        const directRequest = request({ stream: true });
        const result = await callDirectResponses(
            directRequest,
            authorizedTarget(directRequest),
            async () =>
                new Response(upstream, {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );

        await expect(result.response.text()).resolves.toBe(upstream);
        expect(upstream).not.toContain("[DONE]");
    });

    it("fails a Responses stream whose terminal event omits usage", () => {
        const upstream =
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n' +
            'event: response.completed\ndata: {"type":"response.completed","response":{"object":"response","model":"qwen/qwen3.7-plus","status":"completed"}}\n\n';
        const validator = createResponsesStreamUsageValidator();

        expect(() => validator.feed(encoder.encode(upstream))).toThrow(
            /omitted valid terminal usage/,
        );
    });

    it("fails a Responses stream that ends without a terminal event", () => {
        const validator = createResponsesStreamUsageValidator();
        validator.feed(
            encoder.encode(
                'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
            ),
        );

        expect(() => validator.finish()).toThrow(
            /without a terminal usage event/,
        );
    });

    it("accepts an explicit error as a terminal unbillable stream outcome", () => {
        const validator = createResponsesStreamUsageValidator();
        const error = { type: "error", code: "agent_error", message: "failed" };
        validator.feed(
            encoder.encode(`event: error\ndata: ${JSON.stringify(error)}\n\n`),
        );

        expect(() => validator.finish()).not.toThrow();
        expect(isResponsesFailure(error)).toBe(true);
    });

    it("continues event numbering when missing usage fails a stream", async () => {
        const source = new Response(
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial","sequence_number":7}\n\n',
        ).body as ReadableStream<Uint8Array<ArrayBuffer>>;
        const output = await new Response(
            requireResponsesStreamUsage(source),
        ).text();
        expect(output).toContain('"sequence_number":8');
        expect(output).toContain('"code":"usage_missing"');
        expect(output).not.toContain("[DONE]");
    });

    it("accepts response.failed with null usage as an unbillable outcome", () => {
        const validator = createResponsesStreamUsageValidator();
        const failed = {
            type: "response.failed",
            response: { status: "failed", usage: null },
        };
        validator.feed(
            encoder.encode(
                `event: response.failed\ndata: ${JSON.stringify(failed)}\n\n`,
            ),
        );

        expect(() => validator.finish()).not.toThrow();
        expect(isResponsesFailure(failed)).toBe(true);
        expect(getResponsesEventUsage(failed)).toBeNull();
    });

    it("normalizes terminal type from the SSE event field for tracking", () => {
        const event = normalizeResponsesTerminalEvent(
            {
                response: {
                    model: "qwen/qwen3.7-plus",
                    usage: {
                        input_tokens: 2,
                        output_tokens: 1,
                        total_tokens: 3,
                    },
                },
            },
            "response.completed",
        );

        expect(getResponsesEventUsage(event)).toEqual({
            model: "qwen/qwen3.7-plus",
            hasExplicitCacheHit: false,
            usage: expect.objectContaining({
                promptTextTokens: 2,
                completionTextTokens: 1,
            }),
        });
    });
});

it.each([
    [
        {
            tools: [
                {
                    type: "function",
                    name: "weather",
                    parameters: { type: "object", properties: {} },
                },
            ],
        },
        "tool calling",
    ],
    [{ text: { format: { type: "json_object" } } }, "structured output"],
    [{ max_output_tokens: 16385 }, "16384 output tokens"],
])(
    "Scout capability errors use the Responses invalid-request envelope: %j",
    async (options, message) => {
        const app = new Hono<Env>();
        app.use("*", async (c, next) => {
            c.set("model", {
                requested: "llama-scout",
                resolved: "meta/llama-4-scout",
                definition: TEXT_SERVICES["meta/llama-4-scout"],
            });
            await next();
        });
        app.post(
            "/v1/responses",
            validator("json", CreateResponseRequestSchema),
            generateCreateResponse,
        );
        const response = await app.request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-scout",
                    input: "Hello",
                    safe: false,
                    ...options,
                }),
            },
            env,
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: {
                type: "invalid_request_error",
                code: "unsupported_parameter",
                message: expect.stringContaining(message),
            },
        });
    },
);
