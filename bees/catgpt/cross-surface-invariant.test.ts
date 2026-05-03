// Phase N — pin the cross-surface error-code invariant.
//
// All three catgpt surfaces (openai-compat, web-chat, a2a) translate
// upstream non-2xx into the same `code` vocabulary, just wrapped in
// different envelopes. This test fires the same upstream error against
// all three and asserts the resulting `code` strings match.
//
// Why a separate file: each surface's handler.test.ts has its own
// module-load-time fetch stub. This file sets up one shared stub and
// imports all three together so they exercise the same upstream.
//
// What this prevents: if a future edit changes one surface's `code` from
// `upstream_rate_limited` to `rate_limited` (or similar drift), the
// invariant breaks loudly here, not silently in production.

import assert from "node:assert/strict";
import { test } from "node:test";

let upstreamStatus = 200;
let upstreamBody = "";
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

const { handleChatCompletions } = await import(
    "./surfaces/openai-compat/handler.ts"
);
const { handleChatRequest } = await import("./surfaces/web-chat/handler.ts");
const { handleA2ARequest } = await import("./surfaces/a2a/handler.ts");

function openaiReq() {
    return new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "catgpt",
            messages: [{ role: "user", content: "why?" }],
        }),
    });
}

function webReq() {
    return new Request("http://localhost/web/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "why?" }),
    });
}

function a2aReq() {
    return new Request("http://localhost/a2a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "message/send",
            params: {
                message: {
                    role: "user",
                    parts: [{ kind: "text", text: "why?" }],
                },
            },
        }),
    });
}

// Each surface wraps its error envelope differently. The `code` string
// is the cross-surface invariant — extracting it here so the assertion
// reads as "all three return the same code", not "all three return
// shapes I have to reverse-engineer."
async function codeFromOpenai(req: Request): Promise<string> {
    const res = await handleChatCompletions(req);
    const body = (await res.json()) as any;
    return body.error?.code ?? "<no error>";
}

async function codeFromWeb(req: Request): Promise<string> {
    const res = await handleChatRequest(req);
    const body = (await res.json()) as any;
    return body.error?.code ?? "<no error>";
}

async function codeFromA2A(req: Request): Promise<string> {
    const res = await handleA2ARequest(req);
    const body = (await res.json()) as any;
    return body.error?.data?.code ?? "<no error>";
}

test("upstream 401 → all three surfaces emit code: upstream_auth_failed", async () => {
    setUpstream(401, '{"error":"unauthorized"}');
    const codes = await Promise.all([
        codeFromOpenai(openaiReq()),
        codeFromWeb(webReq()),
        codeFromA2A(a2aReq()),
    ]);
    assert.deepEqual(codes, [
        "upstream_auth_failed",
        "upstream_auth_failed",
        "upstream_auth_failed",
    ]);
});

test("upstream 402 → all three surfaces emit code: insufficient_pollen", async () => {
    setUpstream(402, '{"error":"out of pollen"}');
    const codes = await Promise.all([
        codeFromOpenai(openaiReq()),
        codeFromWeb(webReq()),
        codeFromA2A(a2aReq()),
    ]);
    assert.deepEqual(codes, [
        "insufficient_pollen",
        "insufficient_pollen",
        "insufficient_pollen",
    ]);
});

test("upstream 429 → all three surfaces emit code: upstream_rate_limited", async () => {
    setUpstream(429, '{"error":"slow"}', { "retry-after": "30" });
    const codes = await Promise.all([
        codeFromOpenai(openaiReq()),
        codeFromWeb(webReq()),
        codeFromA2A(a2aReq()),
    ]);
    assert.deepEqual(codes, [
        "upstream_rate_limited",
        "upstream_rate_limited",
        "upstream_rate_limited",
    ]);
});

test("upstream 500 → all three surfaces emit code: upstream_error", async () => {
    setUpstream(500, "internal");
    const codes = await Promise.all([
        codeFromOpenai(openaiReq()),
        codeFromWeb(webReq()),
        codeFromA2A(a2aReq()),
    ]);
    assert.deepEqual(codes, [
        "upstream_error",
        "upstream_error",
        "upstream_error",
    ]);
});

test("upstream 429 → REST surfaces forward Retry-After header (a2a uses data.retryAfter)", async () => {
    // Cross-envelope assertion: the same upstream Retry-After value must
    // reach the caller via whichever channel each envelope supports.
    //   HTTP: response header
    //   JSON-RPC: error.data.retryAfter (no header surface in JSON-RPC)
    setUpstream(429, '{"error":"slow"}', { "retry-after": "60" });

    const openaiRes = await handleChatCompletions(openaiReq());
    assert.equal(openaiRes.headers.get("Retry-After"), "60");

    const webRes = await handleChatRequest(webReq());
    assert.equal(webRes.headers.get("Retry-After"), "60");

    const a2aRes = await handleA2ARequest(a2aReq());
    const a2aBody = (await a2aRes.json()) as any;
    assert.equal(a2aBody.error.data.retryAfter, "60");
});
