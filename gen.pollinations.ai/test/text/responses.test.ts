import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it, vi } from "vitest";
import {
    callDirectResponses,
    type DirectResponsesTarget,
    resolveDirectResponsesTarget,
} from "@/text/responses/client.ts";
import { validateDirectResponsesRequest } from "@/text/responses/request.ts";
import { requireResponsesStreamUsage } from "@/text/responses/stream.ts";

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
            validateDirectResponsesRequest(
                request({ tools: [{ type: "web_search_preview" }] }),
            ),
        ).toThrow(/Only function tools/);
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
                return Response.json(body);
            },
        );
        const directRequest = request({
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

    it("preserves semantic Responses SSE without a Chat done marker", async () => {
        const upstream =
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n' +
            'event: response.completed\ndata: {"type":"response.completed","response":{"object":"response","model":"qwen/qwen3.7-plus","status":"completed","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n';
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

    it("fails a Responses stream whose terminal event omits usage", async () => {
        const upstream =
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n' +
            'event: response.completed\ndata: {"type":"response.completed","response":{"object":"response","model":"qwen/qwen3.7-plus","status":"completed"}}\n\n';
        const body = new Response(upstream).body;
        if (!body) throw new Error("expected response body");
        const reader = requireResponsesStreamUsage(body).getReader();

        await expect(reader.read()).rejects.toThrow(
            /omitted valid terminal usage/,
        );
    });

    it("fails a Responses stream that ends without a terminal event", async () => {
        const body = new Response(
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
        ).body;
        if (!body) throw new Error("expected response body");
        const reader = requireResponsesStreamUsage(body).getReader();

        await expect(reader.read()).resolves.toMatchObject({ done: false });
        await expect(reader.read()).rejects.toThrow(
            /without a terminal usage event/,
        );
    });
});
