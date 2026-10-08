import { describe, expect, it } from "vitest";
import {
    chatToResponsesResponse,
    chatToResponsesStream,
    chatUsageToResponsesUsage,
} from "../../src/text/responses/chatToResponse.js";
import type { ChatCompletion } from "../../src/text/types.js";

function completion(over: Record<string, unknown> = {}): ChatCompletion {
    return {
        id: "chatcmpl-1",
        created: 1700000000,
        model: "test-model",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "Hi" },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
        },
        ...over,
    } as unknown as ChatCompletion;
}

function sse(lines: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
    const enc = new TextEncoder();
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(c) {
            for (const l of lines) c.enqueue(enc.encode(`data: ${l}\n\n`));
            c.close();
        },
    });
}

async function collect(
    s: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<string> {
    const dec = new TextDecoder();
    let out = "";
    const reader = s.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
    }
    return out;
}

describe("chatUsageToResponsesUsage", () => {
    it("maps buckets both ways", () => {
        expect(
            chatUsageToResponsesUsage({
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
                prompt_tokens_details: { cached_tokens: 4 },
                completion_tokens_details: { reasoning_tokens: 3 },
            }),
        ).toEqual({
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            input_tokens_details: { cached_tokens: 4 },
            output_tokens_details: { reasoning_tokens: 3 },
        });
    });

    it("returns null when usage is absent or partial", () => {
        expect(chatUsageToResponsesUsage(undefined)).toBeNull();
        expect(
            chatUsageToResponsesUsage({ prompt_tokens: 10 } as never),
        ).toBeNull();
    });
});

describe("chatToResponsesResponse", () => {
    it("builds a completed envelope from text", () => {
        const r = chatToResponsesResponse(completion(), "test-model");
        expect(r.object).toBe("response");
        expect(r.status).toBe("completed");
        expect(r.model).toBe("test-model");
        const msg = (
            r as unknown as { output: Array<Record<string, unknown>> }
        ).output.find((i) => i.type === "message");
        expect(msg).toBeTruthy();
        expect(r.usage).toMatchObject({
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
        });
    });

    it("maps length and content_filter to incomplete", () => {
        const l = chatToResponsesResponse(
            completion({
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "x" },
                        finish_reason: "length",
                    },
                ],
            }),
            "m",
        );
        expect(l.status).toBe("incomplete");
        const f = chatToResponsesResponse(
            completion({
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "x" },
                        finish_reason: "content_filter",
                    },
                ],
            }),
            "m",
        );
        expect(f.status).toBe("incomplete");
    });

    it("maps refusal, reasoning and tool calls", () => {
        const r = chatToResponsesResponse(
            completion({
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: null,
                            refusal: "no",
                            reasoning_content: "hmm",
                            tool_calls: [
                                {
                                    id: "c9",
                                    type: "function",
                                    function: {
                                        name: "f",
                                        arguments: "{}",
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
            }),
            "m",
        );
        const types = (
            r as unknown as { output: Array<Record<string, unknown>> }
        ).output.map((i) => i.type);
        expect(types).toContain("message");
        expect(types).toContain("reasoning");
        expect(types).toContain("function_call");
        expect(r.status).toBe("completed");
    });

    it("throws on error completions and empty choices", () => {
        expect(() =>
            chatToResponsesResponse(
                completion({ error: "boom", choices: [] }),
                "m",
            ),
        ).toThrow();
        expect(() =>
            chatToResponsesResponse(completion({ choices: [] }), "m"),
        ).toThrow();
    });
});

describe("chatToResponsesStream", () => {
    it("emits the full event sequence with monotonic sequence numbers (no [DONE])", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "He" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: { content: "llo" },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 5,
                            total_tokens: 15,
                        },
                    }),
                ]),
                "test-model",
            ),
        );
        expect(out).toContain("response.created");
        expect(out).toContain("response.output_text.delta");
        expect(out).toContain("He");
        expect(out).toContain("response.completed");
        expect(out).toContain('"input_tokens":10');
        // The Responses stream ends on the terminal event — no [DONE] sentinel.
        expect(out).not.toContain("[DONE]");
        expect(out).toContain("event: response.created");
        expect(out).toContain("response.in_progress");
        expect(out).toContain("response.content_part.added");
        expect(out).toContain("response.content_part.done");
        // Every event carries a strictly monotonic sequence_number.
        const seqs = [...out.matchAll(/"sequence_number":(\d+)/g)].map((m) =>
            Number(m[1]),
        );
        expect(seqs.length).toBeGreaterThan(5);
        for (let i = 1; i < seqs.length; i += 1) {
            expect(seqs[i]).toBe(seqs[i - 1] + 1);
        }
    });

    it("always carries cached/reasoning token details and derives total", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            { index: 0, delta: {}, finish_reason: "stop" },
                        ],
                        usage: { prompt_tokens: 7, completion_tokens: 3 },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"cached_tokens":0');
        expect(out).toContain('"reasoning_tokens":0');
        expect(out).toContain('"total_tokens":10');
    });

    it("echoes request controls on the response envelope", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            { index: 0, delta: {}, finish_reason: "stop" },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    }),
                ]),
                "m",
                {
                    model: "m",
                    input: "Hello",
                    temperature: 0.5,
                    metadata: { k: "v" },
                    store: false,
                } as never,
            ),
        );
        expect(out).toContain('"temperature":0.5');
        expect(out).toContain('"metadata":{"k":"v"}');
        expect(out).toContain('"store":false');
        expect(out).toContain('"incomplete_details":null');
    });

    it("keeps an id-less single call together across name and arguments chunks", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        { function: { arguments: '{"a":' } },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            function: {
                                                name: "f",
                                                arguments: "1}",
                                            },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).not.toContain("response.failed");
        expect(out).toContain("response.completed");
        expect(out).toContain("f");
        expect(out).toContain("1}");
    });

    it("propagates client cancellation to the source stream", async () => {
        let cancelled = false;
        const encoder = new TextEncoder();
        const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: {"choices":[{"index":0,"delta":{"content":"Hi"}}]}\n\n',
                    ),
                );
            },
            cancel() {
                cancelled = true;
            },
        });
        const out = chatToResponsesStream(source, "m");
        const reader = out.getReader();
        const first = await reader.read();
        expect(first.done).toBe(false);
        await reader.cancel();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(cancelled).toBe(true);
    });

    it("fails when the stream ends without a terminal signal", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("without a terminal finish_reason");
    });

    it("fails with a response.failed envelope on a mid-stream error", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([JSON.stringify({ error: { message: "bad key" } })]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain('"status":"failed"');
        expect(out).toContain(
            '"error":{"code":"server_error","message":"bad key"}',
        );
        expect(out).toContain("response.created");
    });

    it("accumulates tool call deltas into a function_call item", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "c1",
                                            type: "function",
                                            function: { name: "get_w" },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: {
                                                arguments: '{"c":"S"}',
                                            },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 20,
                            completion_tokens: 8,
                            total_tokens: 28,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain("function_call");
        expect(out).toContain("get_w");
        // Standard OpenAI chunks carry `id` only on the first chunk — the
        // arguments must still land on the same call (regression 2026-10-08).
        // (SSE envelopes JSON-escape the payload, hence the backslashes.)
        expect(out).toContain('\\"c\\":\\"S\\"');
        expect(out).toContain("response.completed");
        // delta and done item_ids must join on the same call.
        const deltaId = out.match(
            /"type":"response\.function_call_arguments\.delta","item_id":"([^"]+)"/,
        )?.[1];
        const doneId = out.match(
            /"type":"response\.function_call_arguments\.done","item_id":"([^"]+)"/,
        )?.[1];
        expect(deltaId).toBeTruthy();
        expect(doneId).toBe(deltaId);
    });

    it("terminal output carries the full text (not empty content)", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {},
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain("response.output_item.added");
        expect(out).toContain("response.output_text.done");
        expect(out).toContain("response.output_item.done");
        expect(out).toContain('"text":"Hi"');
    });

    it("fails loudly when the stream carries no usage", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            { index: 0, delta: {}, finish_reason: "stop" },
                        ],
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("usage");
    });

    it("throws when usage is missing on a completed response", () => {
        expect(() =>
            chatToResponsesResponse(
                completion({
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "Hi" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: undefined,
                }),
                "m",
            ),
        ).toThrow(/usage/);
    });

    it("throws on malformed tool calls instead of dropping them", () => {
        expect(() =>
            chatToResponsesResponse(
                completion({
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [{ type: "function" }],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                }),
                "m",
            ),
        ).toThrow(/malformed tool call/);
    });

    it("turns chat error chunks into Responses error events", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([JSON.stringify({ error: { message: "bad key" } })]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("bad key");
    });

    it("keeps usage from a choices-empty terminal chunk (HIGH regression)", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: { content: "Hi" },
                                finish_reason: "stop",
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 1,
                            total_tokens: 3,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain("response.completed");
        expect(out).toContain('"input_tokens":2');
        expect(out).not.toContain("response.failed");
    });

    it("preserves streaming reasoning_content as a reasoning item", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: { reasoning_content: "pla" },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: { reasoning_content: "n" },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {},
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 3,
                            completion_tokens: 2,
                            total_tokens: 5,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain("response.reasoning_summary_text.delta");
        expect(out).toContain("response.reasoning_summary_text.done");
        expect(out).toContain('"type":"reasoning"');
        expect(out).toContain("plan");
        expect(out).toContain("response.completed");
    });

    it("carries output_index on text/refusal deltas and dones", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [{ index: 0, delta: { content: "Hi" } }],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: { refusal: "no" },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toMatch(
            /"type":"response\.output_text\.delta","item_id":"[^"]+","output_index":0/,
        );
        expect(out).toMatch(
            /"type":"response\.refusal\.delta","item_id":"[^"]+","output_index":1/,
        );
        expect(out).toMatch(
            /"type":"response\.output_text\.done","item_id":"[^"]+","output_index":0/,
        );
    });

    it("keeps output_index unique when tools arrive before text", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "c1",
                                            type: "function",
                                            function: { name: "f" },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    content: "Hi",
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: { arguments: "{}" },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        // delta/done/added for the SAME item share its index by design —
        // uniqueness holds across items (added events), not across events.
        const added = [
            ...out.matchAll(
                /"type":"response\.output_item\.added","output_index":(\d+)/g,
            ),
        ].map((m) => Number(m[1]));
        expect(new Set(added).size).toBe(added.length);
        expect(added.length).toBeGreaterThanOrEqual(2);
        expect(out).toContain("response.completed");
    });

    it("fails loudly on nameless tool arguments in the stream", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: { arguments: "{}" },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("malformed tool call");
    });

    it("merges id-less index-less continuation chunks into one call", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            id: "c1",
                                            type: "function",
                                            function: { name: "f" },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        { function: { arguments: '{"a":' } },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        { function: { arguments: "1}" } },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        const dones = [
            ...out.matchAll(
                /"type":"response\.function_call_arguments\.done","item_id":"([^"]+)","output_index":(\d+),"arguments":"((?:[^"\\]|\\.)*)"/g,
            ),
        ];
        expect(dones).toHaveLength(1);
        expect(out).toContain("response.output_item.added");
        expect(out).toContain('"type":"function_call"');
    });

    it("rejoins id-only continuations with their indexed slot", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "c1",
                                            type: "function",
                                            function: { name: "f" },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            id: "c1",
                                            function: { arguments: "{}" },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        // No phantom nameless slot: one call, completed, not failed.
        expect(out).toContain("response.completed");
        expect(out).not.toContain('"type":"error"');
        expect(out).toContain('"name":"f"');
    });

    it("maps server web-search usage back and forth", () => {
        const r = chatUsageToResponsesUsage({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            server_tool_use_details: { web_search_requests: 2 },
        } as never);
        expect(r).toMatchObject({
            server_tool_use_details: { web_search_requests: 2 },
        });
    });

    it("emits a schema-valid call_id for id-less non-stream tool calls", async () => {
        const { responsesToChatCompletion } = await import(
            "../../src/text/responses/chatResponse.js"
        );
        const url = new URL("https://provider.test/v1/responses");
        const r = chatToResponsesResponse(
            completion({
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: null,
                            tool_calls: [
                                {
                                    type: "function",
                                    function: { name: "f", arguments: "{}" },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
            }),
            "m",
        );
        const call = (
            r as unknown as { output: Array<Record<string, unknown>> }
        ).output.find((i) => i.type === "function_call") as Record<
            string,
            unknown
        >;
        expect(typeof call.call_id).toBe("string");
        expect((call.call_id as string).length).toBeGreaterThan(0);
        const back = responsesToChatCompletion(
            JSON.parse(JSON.stringify(r)),
            "m",
            url,
            { requireUsage: true },
        );
        const calls = (
            (back.choices?.[0]?.message ?? {}) as Record<string, unknown>
        ).tool_calls as Array<unknown>;
        expect(calls).toHaveLength(1);
    });

    it("does not emit a nameless function_call added before the error", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: { arguments: "{}" },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).not.toMatch(
            /"type":"response\.output_item\.added"[^}]*"type":"function_call"/,
        );
        expect(out).not.toContain("response.function_call_arguments.delta");
    });

    it("fails loudly on an id-only tool slot without name or args", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "c1",
                                            type: "function",
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("malformed tool call");
    });

    it("fails loudly on ambiguous parallel continuation chunks", async () => {
        const out = await collect(
            chatToResponsesStream(
                sse([
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "c1",
                                            function: { name: "f1" },
                                        },
                                        {
                                            index: 1,
                                            id: "c2",
                                            function: { name: "f2" },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    tool_calls: [
                                        { function: { arguments: '{"x":1}' } },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 5,
                            total_tokens: 10,
                        },
                    }),
                ]),
                "m",
            ),
        );
        expect(out).toContain('"type":"response.failed"');
        expect(out).toContain("ambiguous");
    });

    it("round-trips Chat -> Responses -> Chat without loss", async () => {
        const { responsesToChatCompletion } = await import(
            "../../src/text/responses/chatResponse.js"
        );
        const url = new URL("https://provider.test/v1/responses");
        const chat = completion({
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Seoul is sunny",
                        tool_calls: [
                            {
                                id: "c7",
                                type: "function",
                                function: {
                                    name: "get_weather",
                                    arguments: '{"city":"Seoul"}',
                                },
                            },
                        ],
                    },
                    finish_reason: "tool_calls",
                },
            ],
        });
        const responses = chatToResponsesResponse(chat, "m");
        const back = responsesToChatCompletion(
            JSON.parse(JSON.stringify(responses)),
            "m",
            url,
            { requireUsage: true },
        );
        const msg = (back.choices?.[0]?.message ?? {}) as unknown as Record<
            string,
            unknown
        >;
        expect(msg.content).toContain("Seoul is sunny");
        const calls = msg.tool_calls as Array<Record<string, unknown>>;
        expect(calls).toHaveLength(1);
        expect((calls[0].function as Record<string, unknown>).name).toBe(
            "get_weather",
        );
        expect(back.choices?.[0]?.finish_reason).toBe("tool_calls");
        expect(back.usage).toMatchObject({
            prompt_tokens: 10,
            completion_tokens: 5,
        });
    });
});
