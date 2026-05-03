import assert from "node:assert/strict";
import { test } from "node:test";

import type { SDKQuery } from "../../src/runner.ts";
import { makeChatHandler } from "./handler.ts";

function fakeQuery(messages: unknown[]): SDKQuery {
    return () => ({
        async *[Symbol.asyncIterator]() {
            for (const m of messages) yield m;
        },
    });
}

async function readSse(res: Response) {
    const text = await res.text();
    return text
        .split("\n\n")
        .filter(Boolean)
        .map((block) => {
            const lines = block.split("\n");
            const event = lines
                .find((l) => l.startsWith("event:"))!
                .slice("event: ".length);
            const data = JSON.parse(
                lines
                    .find((l) => l.startsWith("data:"))!
                    .slice("data: ".length),
            );
            return { event, data };
        });
}

test("rejects non-POST", async () => {
    const handle = makeChatHandler(fakeQuery([]));
    const res = await handle(new Request("http://x/chat"));
    assert.equal(res.status, 405);
});

test("rejects missing prompt or cwd", async () => {
    const handle = makeChatHandler(fakeQuery([]));
    const res = await handle(
        new Request("http://x/chat", {
            method: "POST",
            body: JSON.stringify({ prompt: "hi" }),
        }),
    );
    assert.equal(res.status, 400);
});

test("streams text and done events", async () => {
    const handle = makeChatHandler(
        fakeQuery([
            {
                type: "assistant",
                message: { content: [{ type: "text", text: "all set" }] },
            },
            { type: "result", subtype: "success", num_turns: 1 },
        ]),
    );
    const res = await handle(
        new Request("http://x/chat", {
            method: "POST",
            body: JSON.stringify({ prompt: "hi", cwd: "/tmp/s" }),
        }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const events = await readSse(res);
    assert.equal(events[0].event, "text");
    assert.equal(events[0].data.text, "all set");
    const done = events.find((e) => e.event === "done");
    assert.ok(done);
    assert.equal(done!.data.ok, true);
});
