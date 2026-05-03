import assert from "node:assert/strict";
import { test } from "node:test";

import { runCodeBeeTurn, type SDKQuery } from "./runner.ts";

// Fake `query()` that yields the same message shapes the real SDK emits.
function fakeQuery(messages: unknown[]): SDKQuery {
    return () => ({
        async *[Symbol.asyncIterator]() {
            for (const m of messages) yield m;
        },
    });
}

test("runCodeBeeTurn yields assistant text deltas", async () => {
    const out: string[] = [];
    const stream = runCodeBeeTurn(
        fakeQuery([
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "hello" }] },
            },
            {
                type: "assistant",
                message: { content: [{ type: "text", text: " world" }] },
            },
            { type: "result", subtype: "success", num_turns: 1 },
        ]),
        "hi",
        { cwd: "/tmp/sess-1" },
    );
    for await (const ev of stream) {
        if (ev.type === "text") out.push(ev.text);
        if (ev.type === "result") {
            assert.equal(ev.ok, true);
            assert.equal(ev.turnsUsed, 1);
        }
    }
    assert.deepEqual(out, ["hello", " world"]);
});

test("runCodeBeeTurn surfaces tool-use events", async () => {
    const tools: string[] = [];
    const stream = runCodeBeeTurn(
        fakeQuery([
            { type: "tool_use_summary", tool_name: "Read" },
            { type: "tool_use_summary", tool_name: "Edit" },
            { type: "result", subtype: "success", num_turns: 2 },
        ]),
        "edit foo.ts",
        { cwd: "/tmp/sess-2" },
    );
    for await (const ev of stream) {
        if (ev.type === "tool") tools.push(ev.name);
    }
    assert.deepEqual(tools, ["Read", "Edit"]);
});

test("runCodeBeeTurn requires a cwd", async () => {
    await assert.rejects(async () => {
        const stream = runCodeBeeTurn(fakeQuery([]), "hi", { cwd: "" });
        for await (const _ of stream) {
            /* drain */
        }
    }, /cwd is required/);
});

test("runCodeBeeTurn passes cwd, maxTurns, and tools through to the SDK", async () => {
    let captured: any = null;
    const recordingQuery: SDKQuery = (params) => {
        captured = params;
        return {
            async *[Symbol.asyncIterator]() {
                yield { type: "result", subtype: "success", num_turns: 0 };
            },
        };
    };
    const stream = runCodeBeeTurn(recordingQuery, "ping", {
        cwd: "/tmp/sess-3",
        maxTurns: 4,
        allowedTools: ["Read", "Bash"],
        permissionMode: "acceptEdits",
    });
    for await (const _ of stream) {
        /* drain */
    }
    assert.equal(captured.options.cwd, "/tmp/sess-3");
    assert.equal(captured.options.maxTurns, 4);
    assert.deepEqual(captured.options.allowedTools, ["Read", "Bash"]);
    assert.equal(captured.options.permissionMode, "acceptEdits");
});

test("runCodeBeeTurn defaults to a non-Bash toolset", async () => {
    let captured: any = null;
    const recordingQuery: SDKQuery = (params) => {
        captured = params;
        return {
            async *[Symbol.asyncIterator]() {
                yield { type: "result", subtype: "success", num_turns: 0 };
            },
        };
    };
    const stream = runCodeBeeTurn(recordingQuery, "ping", {
        cwd: "/tmp/sess-4",
    });
    for await (const _ of stream) {
        /* drain */
    }
    // A container bee should not get Bash by default — that's an opt-in
    // because the blast radius is the entire workdir.
    assert.ok(!captured.options.allowedTools.includes("Bash"));
    assert.ok(captured.options.allowedTools.includes("Read"));
});
