import assert from "node:assert/strict";
import { test } from "node:test";

const FAKE_REPLY = "Naps. Next question.";
const FAKE_USAGE = { prompt_tokens: 22, completion_tokens: 6 };

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

const { handleA2ARequest, buildAgentCard } = await import("./handler.ts");

function jsonRpcReq(method: string, params: unknown, id: string | number = 1) {
    return new Request("http://localhost/a2a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
}

test("agent card is served at /.well-known/agent-card.json", async () => {
    const res = await handleA2ARequest(
        new Request("http://localhost/.well-known/agent-card.json"),
    );
    assert.equal(res.status, 200);
    const card = (await res.json()) as any;
    assert.equal(card.name, "CatGPT");
    assert.match(card.description, /sarcastic cat/i);
    assert.equal(typeof card.url, "string");
    assert.ok(Array.isArray(card.skills));
    assert.ok(card.skills.some((s: any) => s.id === "ask"));
});

test("buildAgentCard derives the a2a endpoint URL", () => {
    const card = buildAgentCard("https://example.com");
    assert.equal(card.url, "https://example.com/a2a");
});

test("a2a rejects non-jsonrpc payloads with -32600", async () => {
    const res = await handleA2ARequest(
        new Request("http://localhost/a2a", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ hello: "world" }),
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, -32600);
});

test("a2a rejects unknown method with -32601", async () => {
    const res = await handleA2ARequest(jsonRpcReq("nope/method", {}));
    const body = (await res.json()) as any;
    assert.equal(body.error.code, -32601);
});

test("message/send returns a completed Task with a cat reply and comic_url", async () => {
    const res = await handleA2ARequest(
        jsonRpcReq("message/send", {
            message: {
                role: "user",
                parts: [{ kind: "text", text: "why are boxes magic?" }],
            },
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.id, 1);
    assert.equal(body.result.kind, "task");
    assert.equal(body.result.status.state, "completed");

    const last = body.result.history[body.result.history.length - 1];
    assert.equal(last.role, "agent");
    const text = last.parts.find((p: any) => p.kind === "text");
    const data = last.parts.find((p: any) => p.kind === "data");
    assert.equal(text.text, FAKE_REPLY);
    assert.match(data.data.comic_url, /gen\.pollinations\.ai\/image\//);
});

test("message/send includes usage with cost in the data part", async () => {
    const res = await handleA2ARequest(
        jsonRpcReq("message/send", {
            message: {
                role: "user",
                parts: [{ kind: "text", text: "why?" }],
            },
        }),
    );
    const body = (await res.json()) as any;
    const last = body.result.history[body.result.history.length - 1];
    const data = last.parts.find((p: any) => p.kind === "data");
    assert.equal(data.data.usage.prompt_tokens, FAKE_USAGE.prompt_tokens);
    assert.equal(
        data.data.usage.completion_tokens,
        FAKE_USAGE.completion_tokens,
    );
    assert.ok(data.data.usage.cost_pollen > 0);
    assert.equal(data.data.usage.estimated, false);
});

test("message/send rejects empty parts array with -32602", async () => {
    const res = await handleA2ARequest(
        jsonRpcReq("message/send", { message: { role: "user", parts: [] } }),
    );
    const body = (await res.json()) as any;
    assert.equal(body.error.code, -32602);
});

test("message/send accepts an attached file part as the image", async () => {
    const res = await handleA2ARequest(
        jsonRpcReq("message/send", {
            message: {
                role: "user",
                parts: [
                    { kind: "text", text: "what's this?" },
                    {
                        kind: "file",
                        file: {
                            uri: "https://x.example/p.png",
                            mimeType: "image/png",
                        },
                    },
                ],
            },
        }),
    );
    const body = (await res.json()) as any;
    const last = body.result.history[body.result.history.length - 1];
    const data = last.parts.find((p: any) => p.kind === "data");
    // image input → enhance=false in the comic URL
    assert.match(data.data.comic_url, /enhance=false/);
});

test("upstream 401 → JSON-RPC error -32001 with code: upstream_auth_failed", async () => {
    setUpstream(401, '{"error":"invalid token"}');
    try {
        const res = await handleA2ARequest(
            jsonRpcReq("message/send", {
                message: {
                    role: "user",
                    parts: [{ kind: "text", text: "why?" }],
                },
            }),
        );
        // JSON-RPC always returns 200 (the error is in the envelope).
        assert.equal(res.status, 200);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, -32001);
        assert.equal(body.error.data.code, "upstream_auth_failed");
        assert.equal(body.error.data.upstreamStatus, 401);
    } finally {
        resetUpstream();
    }
});

test("upstream 429 → JSON-RPC error -32003 carries Retry-After in data", async () => {
    setUpstream(429, '{"error":"slow"}', { "retry-after": "30" });
    try {
        const res = await handleA2ARequest(
            jsonRpcReq("message/send", {
                message: {
                    role: "user",
                    parts: [{ kind: "text", text: "why?" }],
                },
            }),
        );
        const body = (await res.json()) as any;
        assert.equal(body.error.code, -32003);
        assert.equal(body.error.data.code, "upstream_rate_limited");
        assert.equal(body.error.data.retryAfter, "30");
        assert.match(body.error.data.hint, /Retry-After: 30/);
    } finally {
        resetUpstream();
    }
});

test("upstream 500 → JSON-RPC error -32099 with code: upstream_error", async () => {
    setUpstream(500, "internal");
    try {
        const res = await handleA2ARequest(
            jsonRpcReq("message/send", {
                message: {
                    role: "user",
                    parts: [{ kind: "text", text: "why?" }],
                },
            }),
        );
        const body = (await res.json()) as any;
        assert.equal(body.error.code, -32099);
        assert.equal(body.error.data.code, "upstream_error");
    } finally {
        resetUpstream();
    }
});
