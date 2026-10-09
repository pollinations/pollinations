import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import { chatStreamToCompletion } from "../../src/text/chat/assemble.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const usage = { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 };

function sse(events: unknown[], done = true): string {
    return (
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
        (done ? "data: [DONE]\n\n" : "")
    );
}

function streamed(wire: string, split = 0) {
    const bytes = new TextEncoder().encode(wire);
    return {
        id: "local",
        created: 1,
        model: "fallback-model",
        stream: true,
        responseStream: new ReadableStream<Uint8Array>({
            start(controller) {
                if (split) controller.enqueue(bytes.slice(0, split));
                controller.enqueue(bytes.slice(split));
                controller.close();
            },
        }),
    };
}

const chunk = { id: "chatcmpl-1", created: 42, model: "grok-4.6" };

describe("chatStreamToCompletion", () => {
    it("rebuilds the JSON completion from content, reasoning and usage", async () => {
        const wire = sse([
            {
                ...chunk,
                choices: [{ index: 0, delta: { role: "assistant" } }],
            },
            {
                ...chunk,
                choices: [{ index: 0, delta: { reasoning_content: "Thi" } }],
            },
            {
                ...chunk,
                choices: [{ index: 0, delta: { reasoning_content: "nk" } }],
            },
            { ...chunk, choices: [{ index: 0, delta: { content: "🌼 Hel" } }] },
            {
                ...chunk,
                choices: [
                    {
                        index: 0,
                        delta: { content: "lo" },
                        finish_reason: "stop",
                    },
                ],
            },
            { ...chunk, choices: [], usage },
        ]);
        // Every byte split, including inside the multi-byte emoji.
        for (const split of [0, 1, 37, 120, wire.length - 3]) {
            const completion = await chatStreamToCompletion(
                streamed(wire, split),
            );
            expect(completion).toEqual({
                id: "chatcmpl-1",
                object: "chat.completion",
                created: 42,
                model: "grok-4.6",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "🌼 Hello",
                            reasoning_content: "Think",
                        },
                        finish_reason: "stop",
                    },
                ],
                usage,
            });
        }
    });

    it("ignores __proto__ keys so a delta cannot pollute Object.prototype", async () => {
        // Raw JSON: an object literal would set the prototype, not a key.
        const wire = [
            `{"id":"chatcmpl-1","created":42,"model":"grok-4.6","__proto__":{"polluted":"top"},"choices":[{"index":0,"delta":{"role":"assistant","content":"Hi","__proto__":{"polluted":"delta"},"constructor":{"prototype":{"polluted":"ctor"}}}}]}`,
            `{"id":"chatcmpl-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"f","arguments":"{}","__proto__":{"polluted":"tool"}}}]},"__proto__":{"polluted":"choice"},"finish_reason":"stop"}]}`,
            JSON.stringify({ ...chunk, choices: [], usage }),
        ]
            .map((event) => `data: ${event}\n\n`)
            .join("");
        try {
            const completion = await chatStreamToCompletion(
                streamed(`${wire}data: [DONE]\n\n`),
            );
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
            expect(Object.prototype).not.toHaveProperty("polluted");
            expect(Object.getPrototypeOf(completion)).toBe(Object.prototype);
            expect(completion.choices?.[0]).toEqual({
                index: 0,
                message: {
                    role: "assistant",
                    content: "Hi",
                    tool_calls: [
                        {
                            type: "function",
                            id: "call_1",
                            function: { name: "f", arguments: "{}" },
                        },
                    ],
                },
                finish_reason: "tool_calls",
            });
        } finally {
            delete (Object.prototype as Record<string, unknown>).polluted;
        }
    });

    it("joins tool call argument deltas by index", async () => {
        const completion = await chatStreamToCompletion(
            streamed(
                sse([
                    {
                        ...chunk,
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    role: "assistant",
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "call_a",
                                            type: "function",
                                            function: {
                                                name: "weather",
                                                arguments: '{"ci',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                    {
                        ...chunk,
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: {
                                                arguments: 'ty":"Rome"}',
                                            },
                                        },
                                        {
                                            index: 1,
                                            id: "call_b",
                                            type: "function",
                                            function: {
                                                name: "time",
                                                arguments: "{}",
                                            },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                    },
                    { ...chunk, choices: [], usage },
                ]),
            ),
        );
        expect(completion.choices?.[0]).toEqual({
            index: 0,
            message: {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_a",
                        type: "function",
                        function: {
                            name: "weather",
                            arguments: '{"city":"Rome"}',
                        },
                    },
                    {
                        id: "call_b",
                        type: "function",
                        function: { name: "time", arguments: "{}" },
                    },
                ],
            },
            finish_reason: "tool_calls",
        });
    });

    it("keeps signed thinking blocks, choice order and the last usage", async () => {
        const completion = await chatStreamToCompletion(
            streamed(
                sse([
                    {
                        ...chunk,
                        choices: [
                            { index: 1, delta: { content: "B" } },
                            {
                                index: 0,
                                delta: {
                                    content_blocks: [
                                        { delta: { thinking: "plan" } },
                                    ],
                                },
                            },
                        ],
                    },
                    {
                        ...chunk,
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    content: "A",
                                    content_blocks: [
                                        { delta: { signature: "sig" } },
                                    ],
                                },
                                finish_reason: "length",
                            },
                        ],
                        usage: {
                            prompt_tokens: 12,
                            completion_tokens: 1,
                            total_tokens: 13,
                        },
                    },
                    { ...chunk, choices: [], usage },
                    // Cost trailers carry no token counts and are not usage.
                    { choices: [], usage: { cost_usd: "0.1" } },
                ]),
            ),
        );
        expect(completion.usage).toEqual(usage);
        expect(completion.choices).toEqual([
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "A",
                    content_blocks: [
                        {
                            type: "thinking",
                            thinking: "plan",
                            signature: "sig",
                        },
                    ],
                },
                finish_reason: "length",
            },
            {
                index: 1,
                message: { role: "assistant", content: "B" },
                finish_reason: "stop",
            },
        ]);
    });

    it("turns an in-stream provider error into an upstream error", async () => {
        await expect(
            chatStreamToCompletion(
                streamed(
                    sse(
                        [
                            {
                                ...chunk,
                                choices: [
                                    { index: 0, delta: { content: "x" } },
                                ],
                            },
                            { error: { message: "overloaded", code: 503 } },
                        ],
                        false,
                    ),
                ),
            ),
        ).rejects.toMatchObject({ status: 503, message: "overloaded" });
    });

    it("leaves usage absent so the caller rejects an unbillable answer", async () => {
        const completion = await chatStreamToCompletion(
            streamed(
                sse([{ ...chunk, choices: [{ delta: { content: "x" } }] }]),
            ),
        );
        expect(completion.usage).toBeUndefined();
    });
});

afterEach(() => vi.restoreAllMocks());

async function chat(body: Record<string, unknown>) {
    const { key } = await createTestApiKey({
        expiresIn: 600,
        user: { packBalance: 100 },
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
                messages: [
                    { role: "user", content: `Hello ${crypto.randomUUID()}` },
                ],
                ...body,
            }),
        }),
        withInlineGenerationCoordinator(env),
        context,
    );
    const text = await response.text();
    await waitOnExecutionContext(context);
    return { response, text };
}

function mockProvider(host: string, reply: () => Response) {
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).host === host) {
            bodies.push(await request.json());
            return reply();
        }
        return Response.json({ data: [] });
    });
    return bodies;
}

it("streams a non-stream reasoning request from the provider and answers JSON", async () => {
    const bodies = mockProvider(
        "myceli-prod-eastus.cognitiveservices.azure.com",
        () =>
            new Response(
                sse([
                    {
                        ...chunk,
                        choices: [{ index: 0, delta: { content: "Hi there" } }],
                    },
                    {
                        ...chunk,
                        choices: [
                            { index: 0, delta: {}, finish_reason: "stop" },
                        ],
                    },
                    { ...chunk, choices: [], usage },
                ]),
                { headers: { "content-type": "text/event-stream" } },
            ),
    );
    const { response, text } = await chat({ model: "grok-4.6" });
    expect(response.status, text).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.stream).toBe(true);
    const completion = JSON.parse(text);
    expect(completion.object).toBe("chat.completion");
    expect(completion.choices[0].message.content).toBe("Hi there");
    expect(completion.choices[0].finish_reason).toBe("stop");
    expect(completion.usage).toMatchObject(usage);
});

it("keeps non-reasoning non-stream requests on the provider's JSON path", async () => {
    const bodies = mockProvider("openrouter.ai", () =>
        Response.json({
            ...chunk,
            object: "chat.completion",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "Plain" },
                    finish_reason: "stop",
                },
            ],
            usage,
        }),
    );
    const { response, text } = await chat({
        model: "google/gemini-2.5-flash-lite:search",
    });
    expect(response.status, text).toBe(200);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.stream).toBe(false);
    expect(JSON.parse(text).choices[0].message.content).toBe("Plain");
});
