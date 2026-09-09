import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
    ResponseUsageSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it, vi } from "vitest";
import {
    callDirectResponses,
    type DirectResponsesTarget,
    resolveDirectResponsesTarget,
} from "@/text/responses/client.ts";
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

    it.each([
        ["store", { store: true }],
        ["previous_response_id", { previous_response_id: "resp_previous" }],
        ["conversation", { conversation: "conv_previous" }],
        ["background", { background: true }],
        ["encrypted state", { include: ["reasoning.encrypted_content"] }],
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

    it("rejects hosted tools without adapting or dropping them", () => {
        expect(() =>
            CreateResponseRequestSchema.parse({
                model: "qwen-large",
                input: "Hello",
                tools: [{ type: "web_search_preview" }],
            }),
        ).toThrow();
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

    it("rejects encrypted and referenced response state", () => {
        expect(() =>
            validateDirectResponsesRequest(
                request({
                    input: [
                        {
                            type: "reasoning",
                            encrypted_content: "opaque-state",
                        },
                    ],
                }),
            ),
        ).toThrow(/Encrypted or reusable response state/);

        expect(() =>
            validateDirectResponsesRequest(
                request({
                    input: [{ type: "item_reference", id: "item_123" }],
                }),
            ),
        ).toThrow(/Encrypted or reusable response state/);
    });

    it("resolves only explicit direct Responses targets", () => {
        expect(resolveDirectResponsesTarget("qwen-large", request())).toEqual(
            expect.objectContaining({
                authConfigured: false,
                endpoint: "https://openrouter.ai/api/v1/responses",
                model: "qwen/qwen3.7-plus",
                defaults: expect.objectContaining({
                    max_output_tokens: 64000,
                    provider: { sort: "price" },
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
    ])("normalizes Qwen3.8 Max 0902 reasoning for %s tool choice", (_label, toolChoice, expectedEffort) => {
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
    });

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
                    provider: { sort: "price" },
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
