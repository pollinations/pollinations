import assert from "node:assert/strict";
import { test } from "node:test";

const FAKE_REPLY = "Naps. Next question.";
const FAKE_USAGE = { prompt_tokens: 10, completion_tokens: 5 };

let upstreamStatus = 200;
let upstreamBody = JSON.stringify({
    choices: [{ message: { content: FAKE_REPLY } }],
    usage: FAKE_USAGE,
});
let upstreamHeaders: Record<string, string> = {
    "content-type": "application/json",
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (url.includes("/v1/chat/completions")) {
        return new Response(upstreamBody, {
            status: upstreamStatus,
            headers: upstreamHeaders,
        });
    }
    return realFetch(input);
};

function setUpstream(
    status: number,
    body: string = "",
    headers: Record<string, string> = {},
) {
    upstreamStatus = status;
    upstreamBody = body;
    upstreamHeaders = { "content-type": "application/json", ...headers };
}

function resetUpstream() {
    upstreamStatus = 200;
    upstreamBody = JSON.stringify({
        choices: [{ message: { content: FAKE_REPLY } }],
        usage: FAKE_USAGE,
    });
    upstreamHeaders = { "content-type": "application/json" };
}

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

test("rejects non-POST with structured 405", async () => {
    const res = await handleChatRequest(
        new Request("http://localhost/chat", { method: "GET" }),
    );
    assert.equal(res.status, 405);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "method_not_allowed");
    assert.match(body.error.hint, /POST/);
});

test("rejects missing question with structured 400", async () => {
    const res = await handleChatRequest(makeReq(undefined));
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "missing_question");
});

test("rejects malformed JSON with structured 400", async () => {
    const res = await handleChatRequest(
        new Request("http://localhost/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "not json",
        }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "invalid_json");
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

test("upstream 401 → structured 401 upstream_auth_failed", async () => {
    setUpstream(401, '{"error":"invalid token"}');
    try {
        const res = await handleChatRequest(makeReq("why?"));
        assert.equal(res.status, 401);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_auth_failed");
    } finally {
        resetUpstream();
    }
});

test("upstream 429 → structured 429 with Retry-After header forwarded", async () => {
    // Lifted from codex's `4d3c9dec`: forward upstream Retry-After verbatim
    // so clients that auto-retry on 429 see the upstream guidance.
    setUpstream(429, '{"error":"slow down"}', { "retry-after": "30" });
    try {
        const res = await handleChatRequest(makeReq("why?"));
        assert.equal(res.status, 429);
        assert.equal(res.headers.get("Retry-After"), "30");
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_rate_limited");
        // Hint should embed the upstream Retry-After value for human readers.
        assert.match(body.error.hint, /Retry-After: 30/);
    } finally {
        resetUpstream();
    }
});

test("upstream 500 → structured 502 upstream_error (we're a gateway)", async () => {
    setUpstream(500, "internal server error");
    try {
        const res = await handleChatRequest(makeReq("why?"));
        assert.equal(res.status, 502);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_error");
    } finally {
        resetUpstream();
    }
});
