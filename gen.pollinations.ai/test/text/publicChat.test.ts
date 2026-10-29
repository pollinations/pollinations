import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { calculatePrice } from "@shared/registry/registry.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import {
    publicChatChoices,
    publicChatStream,
} from "../../src/text/chat/public.ts";
import { requireChatStreamUsage } from "../../src/text/chat/usage.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const metadata = {
    gateway: { gatewayToolCalls: { exa_search: 1 } },
    other: { citation: "https://example.com" },
};
// OpenRouter reports what it charged us next to the token counts.
const usage = {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    cost: 0.007018,
    is_byok: false,
    prompt_tokens_details: { cached_tokens: 0 },
    cost_details: { upstream_inference_cost: 0.00665 },
};
const { cost: _cost, cost_details: _costDetails, ...clientUsage } = usage;
const encoder = new TextEncoder();
describe("client gateway metadata", () => {
    it("removes only gateway metadata without mutating the billing completion", () => {
        const choices = [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "Answer",
                    provider_metadata: metadata,
                    annotations: [{ type: "url_citation" }],
                },
            },
        ];
        const result = publicChatChoices(choices);
        expect(result?.[0].message).toEqual({
            ...choices[0].message,
            provider_metadata: { other: metadata.other },
        });
        expect(choices[0].message.provider_metadata).toEqual(metadata);
        expect(
            publicChatChoices([
                {
                    message: {
                        role: "assistant",
                        provider_metadata: { gateway: metadata.gateway },
                    },
                },
            ])?.[0].message?.provider_metadata,
        ).toBeUndefined();
    });
    it.each(["\n", "\r\n", "\r"])(
        "keeps billing metadata, usage, content and terminal marker across split %j frames",
        async (newline) => {
            const text =
                `id: first\nevent: message\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "🌼", provider_metadata: metadata } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]`.replaceAll(
                    "\n",
                    newline,
                );
            const bytes = encoder.encode(text);
            for (let split = 1; split < bytes.length; split++) {
                const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
                    start(c) {
                        c.enqueue(bytes.slice(0, split));
                        c.enqueue(bytes.slice(split));
                        c.close();
                    },
                });
                const [client, tracking] = requireChatStreamUsage(source).tee();
                const [publicText, billingText] = await Promise.all([
                    new Response(publicChatStream(client)).text(),
                    new Response(tracking).text(),
                ]);
                expect(billingText).toBe(text);
                expect(publicText).not.toContain('"gateway"');
                expect(publicText).toContain('"other"');
                expect(publicText).toContain("🌼");
                expect(publicText).toContain("id: first\nevent: message\n");
                expect(publicText).toContain("data: [DONE]\n\n");
                expect(publicText).toContain(JSON.stringify(clientUsage));
                expect(publicText).not.toContain("cost");
            }
        },
    );
    it("preserves retry instructions on sanitized Vercel streams", async () => {
        const body = new Response("retry: 1500\n\ndata: [DONE]\n\n").body;
        if (!body) throw new Error("Test response has no body");
        const text = await new Response(publicChatStream(body)).text();
        expect(text).toBe("retry: 1500\n\ndata: [DONE]\n\n");
    });
    it("keeps a validated stream error and does not invent a terminal marker", async () => {
        const body = new Response(
            'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\ndata: [DONE]\n\n',
        ).body;
        if (!body) throw new Error("Test response has no body");
        const text = await new Response(
            publicChatStream(requireChatStreamUsage(body)),
        ).text();
        expect(text).toContain('"usage_missing"');
        expect(text).not.toContain("[DONE]");
    });
});

it("also returns Gemini tool-call signatures in Google's extra_content field", () => {
    const signed = {
        id: "call_1",
        type: "function",
        function: {
            name: "read_file",
            arguments: "{}",
            thought_signature: "sig",
        },
    };
    const unsigned = {
        id: "call_2",
        type: "function",
        function: { name: "read_file", arguments: "{}" },
    };
    const toolCalls = [signed, unsigned];
    const [message] = publicChatChoices([
        { index: 0, message: { role: "assistant", tool_calls: toolCalls } },
    ]) ?? [{}];
    const [delta] = publicChatChoices([
        { index: 0, delta: { tool_calls: [{ index: 0, ...signed }] } },
    ]) ?? [{}];

    const google = { google: { thought_signature: "sig" } };
    expect(message.message?.tool_calls).toEqual([
        { ...signed, extra_content: google },
        unsigned,
    ]);
    expect(delta.delta?.tool_calls).toEqual([
        { index: 0, ...signed, extra_content: google },
    ]);
    expect(toolCalls[0]).not.toHaveProperty("extra_content");
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

async function chatThroughHandler(
    model: string,
    host: string | string[],
    wire: string | ((request: Request) => Promise<Response>),
    stream = true,
    prompt = `Hello ${crypto.randomUUID()}`,
) {
    const { key, userId } = await createTestApiKey({
        expiresIn: 600,
        user: { packBalance: 100 },
    });
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        // Custom-host providers go out through the Portkey gateway.
        const target =
            request.headers.get("x-portkey-custom-host") ?? request.url;
        if ([host].flat().includes(new URL(target).host)) {
            calls++;
            if (typeof wire === "function") return wire(request);
            return new Response(wire, {
                headers: {
                    "content-type": stream
                        ? "text/event-stream"
                        : "application/json",
                },
            });
        }
        return Response.json({ data: [] });
    });
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model,
                stream,
                messages: [{ role: "user", content: prompt }],
            }),
        }),
        withInlineGenerationCoordinator(env),
        context,
    );
    const text = await response.text();
    await waitOnExecutionContext(context);
    const balance = await getUserBalance(drizzle(env.DB), userId);
    return { response, text, calls, balance };
}

it("drops OpenRouter's provider cost from client streams", async () => {
    const model = "inception/mercury-3";
    const wire = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "🌼" } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`;
    const { response, text, calls } = await chatThroughHandler(
        model,
        "openrouter.ai",
        wire,
    );
    expect(response.status, text).toBe(200);
    expect(response.headers.get("x-model-used")).toBe(model);
    expect(calls).toBe(1);
    expect(text).toContain("🌼");
    expect(text).toContain(JSON.stringify(clientUsage));
    expect(text).toContain("data: [DONE]\n\n");
    expect(text).not.toContain("cost");
});

it("drops OpenRouter's provider cost from non-streaming completions", async () => {
    const model = "inception/mercury-3";
    const wire = JSON.stringify({
        id: "gen-nonstream",
        object: "chat.completion",
        created: 1760000000,
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "🌼 hello" },
                finish_reason: "stop",
            },
        ],
        usage,
    });
    const { response, text, calls } = await chatThroughHandler(
        model,
        "openrouter.ai",
        wire,
        false,
    );
    expect(response.status, text).toBe(200);
    expect(calls).toBe(1);
    expect(JSON.parse(text).usage).toEqual(clientUsage);
    expect(text).not.toContain("cost");
});

it("returns tool-call signatures in Google's extra_content field from non-streaming completions", async () => {
    const model = "inception/mercury-3";
    const wire = JSON.stringify({
        id: "gen-signed",
        object: "chat.completion",
        created: 1760000000,
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    tool_calls: [
                        {
                            id: "call_1",
                            type: "function",
                            function: {
                                name: "read_file",
                                arguments: "{}",
                                thought_signature: "sig",
                            },
                        },
                    ],
                },
                finish_reason: "tool_calls",
            },
        ],
        usage,
    });
    const { response, text } = await chatThroughHandler(
        model,
        "openrouter.ai",
        wire,
        false,
    );
    expect(response.status, text).toBe(200);
    expect(JSON.parse(text).choices[0].message.tool_calls[0]).toMatchObject({
        function: { thought_signature: "sig" },
        extra_content: { google: { thought_signature: "sig" } },
    });
});

it.each([null, "", " \n\t"])(
    "rejects empty content %j before caching while retaining provider usage",
    async (content) => {
        const model = "inception/mercury-3";
        const wire = JSON.stringify({
            id: "empty-completion",
            object: "chat.completion",
            model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content,
                        reasoning_content: "Reasoning alone is not an answer",
                    },
                    finish_reason: "stop",
                },
            ],
            usage,
        });
        const prompt = `Empty completion ${crypto.randomUUID()}`;
        for (let attempt = 0; attempt < 2; attempt++) {
            const { response, text, calls, balance } = await chatThroughHandler(
                model,
                "openrouter.ai",
                wire,
                false,
                prompt,
            );
            expect(response.status, text).toBe(502);
            expect(JSON.parse(text).error.code).toBe("empty_response");
            expect(response.headers.get("x-cache")).not.toBe("HIT");
            expect(calls).toBe(1);
            expect(balance.packBalance).toBeLessThan(100);
        }
    },
);

it("reports exhausted reasoning budgets without fallback or caching, retaining usage", async () => {
    const model = "openai/gpt-5-nano";
    const wire = JSON.stringify({
        id: "reasoning-budget-exhausted",
        object: "chat.completion",
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "" },
                finish_reason: "length",
            },
        ],
        usage: {
            prompt_tokens: 50,
            completion_tokens: 60,
            total_tokens: 110,
            completion_tokens_details: { reasoning_tokens: 60 },
        },
    });
    const prompt = `Exhausted reasoning budget ${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        const { response, text, calls, balance } = await chatThroughHandler(
            model,
            [
                "myceli-prod-eastus.cognitiveservices.azure.com",
                "api.openai.com",
            ],
            wire,
            false,
            prompt,
        );
        expect(response.status, text).toBe(400);
        expect(JSON.parse(text).error).toMatchObject({
            code: "output_token_limit_exceeded",
            message: expect.stringContaining("Increase the token limit"),
        });
        expect(calls).toBe(1);
        expect(response.headers.get("x-cache")).not.toBe("HIT");
        expect(balance.packBalance).toBeCloseTo(
            100 -
                calculatePrice(model, {
                    promptTextTokens: 50,
                    completionReasoningTokens: 60,
                }).totalPrice,
            8,
        );
    }
});

it("preserves a partial answer when the output token limit is reached", async () => {
    const { response, text } = await chatThroughHandler(
        "inception/mercury-3",
        "openrouter.ai",
        JSON.stringify({
            id: "partial-completion",
            object: "chat.completion",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "A partial answer" },
                    finish_reason: "length",
                },
            ],
            usage,
        }),
        false,
    );
    expect(response.status, text).toBe(200);
    expect(JSON.parse(text).choices[0]).toMatchObject({
        message: { content: "A partial answer" },
        finish_reason: "length",
    });
});

it.each([
    { content: null, refusal: "I cannot help with that request." },
    {
        content: null,
        audio: {
            id: "audio_1",
            data: "YXVkaW8=",
            transcript: "Hello",
            expires_at: 1900000000,
        },
    },
])("preserves non-text-only completion output %j", async (output) => {
    const model = "inception/mercury-3";
    const wire = JSON.stringify({
        id: "non-text-completion",
        object: "chat.completion",
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", ...output },
                finish_reason: "stop",
            },
        ],
        usage,
    });
    const { response, text } = await chatThroughHandler(
        model,
        "openrouter.ai",
        wire,
        false,
    );
    expect(response.status, text).toBe(200);
    expect(JSON.parse(text).choices[0].message).toMatchObject(output);
});

it("rejects the news failure's empty Responses completion through the Chat adapter", async () => {
    const completion = {
        id: "resp_empty_news",
        model: "gpt-6-sol",
        status: "completed",
        output: [
            {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "" }],
            },
        ],
        usage: {
            input_tokens: 3531,
            output_tokens: 131,
            total_tokens: 3662,
            output_tokens_details: { reasoning_tokens: 125 },
        },
    };
    const { response, text, calls } = await chatThroughHandler(
        "openai/gpt-6-sol",
        ["myceli-prod-eastus.openai.azure.com", "api.openai.com"],
        async (request) => {
            const body = (await request.json()) as { stream?: boolean };
            return body.stream
                ? new Response(
                      `data: ${JSON.stringify({ type: "response.completed", response: completion })}\n\n`,
                      {
                          headers: { "content-type": "text/event-stream" },
                      },
                  )
                : Response.json(completion);
        },
        false,
    );
    expect(response.status, text).toBe(502);
    expect(JSON.parse(text).error.code).toBe("empty_response");
    expect(calls).toBe(2);
});

it("preserves content-filter refusals without treating them as retryable empty output", async () => {
    const model = "inception/mercury-3";
    const { response, text, calls } = await chatThroughHandler(
        model,
        "openrouter.ai",
        JSON.stringify({
            id: "filtered-completion",
            object: "chat.completion",
            model,
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "" },
                    finish_reason: "content_filter",
                },
            ],
            usage,
        }),
        false,
    );
    expect(response.status, text).toBe(200);
    expect(JSON.parse(text).choices[0].finish_reason).toBe("content_filter");
    expect(calls).toBe(1);
});

it("drops InferencePort's PAYG ledger chunk from client streams", async () => {
    vi.stubEnv("INFERENCEPORT_API_KEY", "test-ip-key");
    const streamUsage = {
        prompt_tokens: 3,
        completion_tokens: 1,
        total_tokens: 4,
    };
    const ledger = {
        payg_credits_charged: 0.0001,
        payg_ledger_entry: { balance_after: 38.9 },
    };
    const wire = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "🌼" } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { ...streamUsage, payg_credits_charged: 0.00005 } })}\n\ndata: ${JSON.stringify({ id: "chatcmpl-proxy-meta", choices: [], payg_usage: ledger })}\n\ndata: [DONE]\n\n`;
    const { response, text, calls, balance } = await chatThroughHandler(
        "inferenceport-ai/lightning-text-v2.1",
        "api.inferenceport.ai",
        wire,
    );
    expect(response.status, text).toBe(200);
    expect(calls).toBe(1);
    expect(text).toContain("🌼");
    expect(text).toContain(JSON.stringify(streamUsage));
    expect(text).toContain("data: [DONE]\n\n");
    expect(text).not.toContain("payg");
    expect(balance.packBalance).toBeCloseTo(100 - 0.0001, 10);
});

it("drops InferencePort's PAYG ledger entry from non-streaming completions", async () => {
    vi.stubEnv("INFERENCEPORT_API_KEY", "test-ip-key");
    const { key, userId } = await createTestApiKey({
        expiresIn: 600,
        user: { packBalance: 100 },
    });
    let calls = 0;
    const wire = JSON.stringify({
        id: "chatcmpl-nonstream",
        object: "chat.completion",
        created: 1760000000,
        model: "inferenceport-ai/lightning-text-v2.1",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "🌼 hello" },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 3,
            completion_tokens: 1,
            total_tokens: 4,
            payg_credits_charged: 0.0001,
        },
        // Top-level ledger entry, same shape the stream test strips.
        payg_usage: {
            payg_credits_charged: 0.0001,
            payg_ledger_entry: { balance_after: 38.9 },
        },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        const target =
            request.headers.get("x-portkey-custom-host") ?? request.url;
        if (new URL(target).host === "api.inferenceport.ai") {
            calls++;
            return new Response(wire, {
                headers: { "content-type": "application/json" },
            });
        }
        return Response.json({ data: [] });
    });
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "inferenceport-ai/lightning-text-v2.1",
                messages: [
                    { role: "user", content: `Hello ${crypto.randomUUID()}` },
                ],
            }),
        }),
        withInlineGenerationCoordinator(env),
        context,
    );
    const text = await response.text();
    await waitOnExecutionContext(context);
    expect(response.status, text).toBe(200);
    expect(calls).toBe(1);
    expect(text).toContain("🌼 hello");
    expect(text).not.toContain("payg");
    expect(text).not.toContain("balance_after");
    const balance = await getUserBalance(drizzle(env.DB), userId);
    expect(balance.packBalance).toBeCloseTo(100 - 0.0001, 10);
});

it.each([false, true])(
    "settles Lightning v2 privately through the handler (stream=%s)",
    async (stream) => {
        vi.stubEnv("INFERENCEPORT_API_KEY", "test-ip-key");
        const usage = {
            prompt_tokens: 1819,
            completion_tokens: 1,
            total_tokens: 1820,
            payg_credits_charged: 0.0001,
        };
        const completion = {
            id: "chatcmpl-lightning-v2",
            object: "chat.completion",
            created: 1760000000,
            model: "lightning",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "OK" },
                    finish_reason: "stop",
                },
            ],
            usage,
        };
        const wire = stream
            ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "OK" } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: ${JSON.stringify({ payg_usage: { payg_credits_charged: 0.0001 } })}\n\ndata: [DONE]\n\n`
            : JSON.stringify(completion);
        const { response, text, calls, balance } = await chatThroughHandler(
            "inferenceport-ai/lightning-text-v2",
            "api.inferenceport.ai",
            wire,
            stream,
        );
        expect(response.status, text).toBe(200);
        expect(calls).toBe(1);
        expect(text).toContain("OK");
        expect(text).not.toContain("payg_");
        expect(balance.packBalance).toBeCloseTo(100 - 0.0001, 10);
    },
);
