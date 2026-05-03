import assert from "node:assert/strict";
import { test } from "node:test";

const FAKE_REPLY = "Naps. Next question.";
const FAKE_USAGE = { prompt_tokens: 10, completion_tokens: 5 };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (url.includes("/v1/chat/completions")) {
        return new Response(
            JSON.stringify({
                choices: [{ message: { content: FAKE_REPLY } }],
                usage: FAKE_USAGE,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    }
    return realFetch(input);
};

const { handleChatRequest } = await import("./handler.ts");

function makeReq(
    question: string | undefined,
    opts: { stream?: boolean } = {},
) {
    const url = `http://localhost/chat${opts.stream ? "?stream=1" : ""}`;
    return new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
    });
}

test("rejects non-POST", async () => {
    const res = await handleChatRequest(
        new Request("http://localhost/chat", { method: "GET" }),
    );
    assert.equal(res.status, 405);
});

test("rejects missing question", async () => {
    const res = await handleChatRequest(makeReq(undefined));
    assert.equal(res.status, 400);
});

test("non-streaming response has reply + comicUrl", async () => {
    const res = await handleChatRequest(makeReq("why?"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.reply, FAKE_REPLY);
    assert.match(body.comicUrl, /gen\.pollinations\.ai\/image\//);
});

test("streaming response is SSE with reply, comic, usage, done events", async () => {
    const res = await handleChatRequest(makeReq("why?", { stream: true }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const text = await res.text();
    assert.match(text, /event: reply\ndata: \{"text":/);
    assert.match(text, /event: comic\ndata: \{"url":/);
    assert.match(text, /event: usage\ndata: \{/);
    assert.match(text, /"cost_pollen":/);
    assert.match(text, /event: done\ndata: \{\}/);
});

test("non-streaming response includes usage with cost", async () => {
    const res = await handleChatRequest(makeReq("why?"));
    const body = (await res.json()) as any;
    assert.equal(body.usage.prompt_tokens, FAKE_USAGE.prompt_tokens);
    assert.equal(body.usage.completion_tokens, FAKE_USAGE.completion_tokens);
    assert.ok(body.usage.cost_pollen > 0);
    assert.equal(body.usage.estimated, false);
});
