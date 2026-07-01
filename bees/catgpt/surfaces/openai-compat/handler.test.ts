import assert from "node:assert/strict";
import { test } from "node:test";

// Pure shape tests. Network calls are stubbed by patching globalThis.fetch
// before importing the handler, so generateCatReply returns a fixture.

const FAKE_REPLY = "Naps. Next question.";

const FAKE_USAGE = { prompt_tokens: 42, completion_tokens: 8 };

// Mutable upstream state — tests flip these to exercise non-2xx paths.
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

const { handleChatCompletions } = await import("./handler.ts");

function makeReq(body: unknown, init: { stream?: boolean } = {}) {
    return new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "catgpt",
            stream: init.stream,
            ...(body as object),
        }),
    });
}

test("GET / returns discovery JSON with copyable curl", async () => {
    const res = await handleChatCompletions(
        new Request("http://localhost/", { method: "GET" }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.name, "CatGPT");
    assert.equal(typeof body.endpoints.chat, "string");
    assert.match(body.endpoints.chat, /\/v1\/chat\/completions$/);
    assert.equal(typeof body.endpoints.agent_card, "string");
    assert.equal(typeof body.try, "string");
    assert.match(body.try, /^curl /);
});

test("GET /v1/chat/completions also returns discovery (probe-friendly)", async () => {
    const res = await handleChatCompletions(
        new Request("http://localhost/v1/chat/completions", { method: "GET" }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.name, "CatGPT");
});

test("rejects DELETE with structured 405 + hint", async () => {
    const res = await handleChatCompletions(
        new Request("http://localhost/v1/chat/completions", {
            method: "DELETE",
        }),
    );
    assert.equal(res.status, 405);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "method_not_allowed");
    assert.match(body.error.message, /DELETE/);
    assert.match(body.error.hint, /POST|GET/);
});

test("rejects malformed JSON with code: invalid_json", async () => {
    const res = await handleChatCompletions(
        new Request("http://localhost/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "not json {",
        }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "invalid_json");
    assert.match(body.error.hint, /messages/);
});

test("rejects missing messages with code: missing_messages", async () => {
    const res = await handleChatCompletions(makeReq({}));
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "missing_messages");
    assert.match(body.error.message, /required/);
});

test("rejects empty messages array with code: empty_messages", async () => {
    const res = await handleChatCompletions(makeReq({ messages: [] }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "empty_messages");
});

test("rejects messages with no user turn (system-only) with code: no_user_message", async () => {
    const res = await handleChatCompletions(
        makeReq({
            messages: [{ role: "system", content: "be helpful" }],
        }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "no_user_message");
});

test("non-streaming response is OpenAI-shaped", async () => {
    const res = await handleChatCompletions(
        makeReq({ messages: [{ role: "user", content: "why?" }] }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.object, "chat.completion");
    assert.equal(body.model, "catgpt");
    assert.equal(body.choices[0].message.role, "assistant");
    assert.equal(body.choices[0].message.content, FAKE_REPLY);
    assert.equal(body.choices[0].finish_reason, "stop");
    assert.match(
        body.choices[0].message.metadata.comic_url,
        /gen\.pollinations\.ai\/image\//,
    );
});

test("streaming response is SSE with chat.completion.chunk objects", async () => {
    const res = await handleChatCompletions(
        makeReq(
            { messages: [{ role: "user", content: "why?" }] },
            { stream: true },
        ),
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const text = await res.text();
    // First a role chunk, then content chunks, then a metadata chunk, then [DONE].
    assert.match(text, /"delta":\{"role":"assistant"\}/);
    assert.match(text, /"delta":\{"content":"/);
    assert.match(text, /"comic_url":/);
    assert.match(text, /\[DONE\]/);
});

test("non-streaming response includes populated usage with cost fields", async () => {
    const res = await handleChatCompletions(
        makeReq({ messages: [{ role: "user", content: "why?" }] }),
    );
    const body = (await res.json()) as any;
    assert.equal(body.usage.prompt_tokens, FAKE_USAGE.prompt_tokens);
    assert.equal(body.usage.completion_tokens, FAKE_USAGE.completion_tokens);
    assert.equal(
        body.usage.total_tokens,
        FAKE_USAGE.prompt_tokens + FAKE_USAGE.completion_tokens,
    );
    // Cost-attribution fields. claude-fast pricing is non-zero, so cost
    // should be > 0 and not flagged as estimated.
    assert.ok(body.usage.cost_pollen > 0);
    assert.ok(body.usage.cost_dollars > 0);
    assert.equal(body.usage.cost_estimated, false);
    assert.equal(body.usage.cost_model, "claude-fast");
});

test("streaming response emits a final usage chunk", async () => {
    const res = await handleChatCompletions(
        makeReq(
            { messages: [{ role: "user", content: "why?" }] },
            { stream: true },
        ),
    );
    const text = await res.text();
    // Find the usage chunk: it has "usage":{...} and choices: [].
    assert.match(text, /"choices":\[\],"usage":\{/);
    assert.match(text, /"prompt_tokens":42/);
    assert.match(text, /"cost_pollen":/);
});

test("handles multipart user content with image_url", async () => {
    const res = await handleChatCompletions(
        makeReq({
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "what's this?" },
                        {
                            type: "image_url",
                            image_url: { url: "https://x.example/p.png" },
                        },
                    ],
                },
            ],
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    // The comic URL should reflect the uploaded image (enhance=false).
    assert.match(body.choices[0].message.metadata.comic_url, /enhance=false/);
});

test("upstream 401 → structured 401 upstream_auth_failed (not 500)", async () => {
    setUpstream(401, '{"error":"invalid token"}');
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        assert.equal(res.status, 401);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_auth_failed");
        assert.match(body.error.hint, /pk_/);
    } finally {
        resetUpstream();
    }
});

test("upstream 402 → structured 402 insufficient_pollen", async () => {
    setUpstream(402, '{"error":"out of pollen"}');
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        assert.equal(res.status, 402);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "insufficient_pollen");
        assert.match(body.error.hint, /enter\.pollinations\.ai/);
    } finally {
        resetUpstream();
    }
});

test("upstream 429 → structured 429 upstream_rate_limited", async () => {
    setUpstream(429, '{"error":"slow down"}');
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        assert.equal(res.status, 429);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_rate_limited");
        assert.match(body.error.hint, /Retry-After|retry/);
    } finally {
        resetUpstream();
    }
});

test("upstream 429 with Retry-After header → forwarded verbatim (lifted from codex 4d3c9dec)", async () => {
    setUpstream(429, '{"error":"slow"}', { "retry-after": "60" });
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        assert.equal(res.status, 429);
        // Header forwarded so auto-retrying clients honor upstream guidance.
        assert.equal(res.headers.get("Retry-After"), "60");
        const body = (await res.json()) as any;
        // Hint embeds the value for human readers.
        assert.match(body.error.hint, /Retry-After: 60/);
    } finally {
        resetUpstream();
    }
});

test("upstream 500 → structured 502 upstream_error (we don't pretend to be the upstream)", async () => {
    setUpstream(500, "internal server error");
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        // We translate any 5xx upstream → 502 to the caller, since the
        // upstream is acting as our backend; it isn't the bee that's broken.
        assert.equal(res.status, 502);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_error");
        assert.match(body.error.message, /500/);
    } finally {
        resetUpstream();
    }
});

test("upstream 403 → structured 403 upstream_auth_failed (also auth-class)", async () => {
    setUpstream(403, '{"error":"forbidden"}');
    try {
        const res = await handleChatCompletions(
            makeReq({ messages: [{ role: "user", content: "why?" }] }),
        );
        assert.equal(res.status, 403);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "upstream_auth_failed");
    } finally {
        resetUpstream();
    }
});
