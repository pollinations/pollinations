import assert from "node:assert/strict";
import { test } from "node:test";

import type { SDKQuery } from "../../src/runner.ts";
import { makeChatCompletionsHandler } from "./handler.ts";

// Fake `query()` that yields the same message shapes the real SDK emits.
// Mirrors the pattern in src/runner.test.ts so this surface stays install-free.
function fakeQuery(messages: unknown[]): SDKQuery {
    return () => ({
        async *[Symbol.asyncIterator]() {
            for (const m of messages) yield m;
        },
    });
}

const SUCCESS_STREAM = [
    {
        type: "assistant",
        message: { content: [{ type: "text", text: "renaming foo.ts" }] },
    },
    { type: "tool_use_summary", tool_name: "Read" },
    { type: "tool_use_summary", tool_name: "Edit" },
    {
        type: "assistant",
        message: { content: [{ type: "text", text: "done." }] },
    },
    { type: "result", subtype: "success", num_turns: 2 },
];

function makeReq(body: object): Request {
    return new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

test("rejects non-POST", async () => {
    const handler = makeChatCompletionsHandler(fakeQuery([]));
    const res = await handler(
        new Request("http://x/v1/chat/completions", { method: "GET" }),
    );
    assert.equal(res.status, 405);
});

test("rejects missing messages", async () => {
    const handler = makeChatCompletionsHandler(fakeQuery([]));
    const res = await handler(makeReq({ code_bee: { cwd: "/tmp/sess-x" } }));
    assert.equal(res.status, 400);
});

test("rejects missing code_bee.cwd — container runtime needs a workdir", async () => {
    const handler = makeChatCompletionsHandler(fakeQuery(SUCCESS_STREAM));
    const res = await handler(
        makeReq({ messages: [{ role: "user", content: "rename foo.ts" }] }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? "", /cwd/);
});

test("non-streaming response is OpenAI-shaped with code_bee extension", async () => {
    const handler = makeChatCompletionsHandler(fakeQuery(SUCCESS_STREAM));
    const res = await handler(
        makeReq({
            messages: [{ role: "user", content: "rename foo.ts" }],
            code_bee: { cwd: "/tmp/sess-1" },
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    // Standard OpenAI fields.
    assert.equal(body.object, "chat.completion");
    assert.equal(body.model, "code-bee");
    assert.equal(body.choices[0].message.role, "assistant");
    assert.equal(body.choices[0].message.content, "done.");
    assert.equal(body.choices[0].finish_reason, "stop");

    // Usage block: estimated, since the SDK doesn't surface token counts at
    // the result level. Platform backfills container-time-based billing.
    assert.equal(body.usage.cost_estimated, true);

    // Non-standard code_bee extension carries the agent's tool trace.
    assert.equal(body.code_bee.ok, true);
    assert.equal(body.code_bee.turnsUsed, 2);
    assert.deepEqual(body.code_bee.tool_trace, [
        { name: "Read", status: "finished" },
        { name: "Edit", status: "finished" },
    ]);
});

test("non-streaming returns finish_reason=length when maxTurns hit and not ok", async () => {
    const handler = makeChatCompletionsHandler(
        fakeQuery([
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "still working" }] },
            },
            { type: "result", subtype: "error_max_turns", num_turns: 4 },
        ]),
    );
    const res = await handler(
        makeReq({
            messages: [{ role: "user", content: "long task" }],
            code_bee: { cwd: "/tmp/sess-2", maxTurns: 4 },
        }),
    );
    const body = (await res.json()) as any;
    assert.equal(body.choices[0].finish_reason, "length");
    assert.equal(body.code_bee.ok, false);
    assert.equal(body.code_bee.turnsUsed, 4);
});

test("streaming response emits role chunk, content deltas, tool chunks, and final stop", async () => {
    const handler = makeChatCompletionsHandler(fakeQuery(SUCCESS_STREAM));
    const res = await handler(
        makeReq({
            stream: true,
            messages: [{ role: "user", content: "rename foo.ts" }],
            code_bee: { cwd: "/tmp/sess-3" },
        }),
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const text = await res.text();

    // First chunk announces the assistant role.
    assert.match(text, /"role":"assistant"/);

    // Content delta for the first text event ("renaming foo.ts") and the
    // second event's incremental delta should also appear.
    assert.match(text, /"content":"renaming foo.ts"/);
    assert.match(text, /"content":"done."/);

    // Tool events are projected as code_bee.tool top-level fields with empty
    // delta — standard OpenAI clients see no content change.
    assert.match(text, /"code_bee":\{"tool":\{"name":"Read"/);
    assert.match(text, /"code_bee":\{"tool":\{"name":"Edit"/);

    // Final chunk has finish_reason: "stop" and the [DONE] sentinel.
    assert.match(text, /"finish_reason":"stop"/);
    assert.match(text, /data: \[DONE\]/);
});

test("streaming emits finish_reason=length when SDK reports max_turns", async () => {
    const handler = makeChatCompletionsHandler(
        fakeQuery([
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "partial" }] },
            },
            { type: "result", subtype: "error_max_turns", num_turns: 8 },
        ]),
    );
    const res = await handler(
        makeReq({
            stream: true,
            messages: [{ role: "user", content: "x" }],
            code_bee: { cwd: "/tmp/sess-4", maxTurns: 8 },
        }),
    );
    const text = await res.text();
    assert.match(text, /"finish_reason":"length"/);
});

test("streaming content deltas are incremental, not cumulative", async () => {
    // The SDK can emit cumulative assistant text. The handler must diff
    // against the last emitted text so OpenAI streaming clients don't see
    // duplicate content.
    const handler = makeChatCompletionsHandler(
        fakeQuery([
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "hel" }] },
            },
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "hello" }] },
            },
            { type: "result", subtype: "success", num_turns: 1 },
        ]),
    );
    const res = await handler(
        makeReq({
            stream: true,
            messages: [{ role: "user", content: "hi" }],
            code_bee: { cwd: "/tmp/sess-5" },
        }),
    );
    const text = await res.text();

    // First delta: "hel". Second delta: "lo" (the new portion).
    assert.match(text, /"content":"hel"/);
    assert.match(text, /"content":"lo"/);
    // The full word "hello" should NOT appear as a delta — that would be
    // a cumulative emission and double the rendered text.
    assert.equal(/"content":"hello"/.test(text), false);
});
