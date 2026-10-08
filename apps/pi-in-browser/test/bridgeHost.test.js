// Unit tests for the host-side bridge: envelope validation, frame
// (de)serialization, auth injection, caps, and fail-closed behavior.
// Run: node --test test/*.test.js

import assert from "node:assert/strict";
import test from "node:test";
import {
    createBridgeHost,
    createFrameParser,
    encodeChunk,
    ID_RE,
    validateEnvelope,
} from "../src/bridgeHost.js";

const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

function frameBytes(obj) {
    const payload = Buffer.from(JSON.stringify(obj), "utf8");
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length, 0);
    return Buffer.concat([head, payload]);
}

test("ID_RE accepts v4-shaped ids and rejects others", () => {
    assert.ok(ID_RE.test(VALID_ID));
    assert.ok(!ID_RE.test("../etc/passwd"));
    assert.ok(!ID_RE.test(""));
    assert.ok(!ID_RE.test(VALID_ID.toUpperCase()));
});

test("frame parser: splits frames across chunk boundaries", () => {
    const seen = [];
    const parse = createFrameParser((f) => seen.push(f));
    const a = frameBytes({ type: "head", id: VALID_ID, status: 200 });
    const b = frameBytes({ type: "chunk", id: VALID_ID, b64: "aGk=" });
    // one chunk containing both frames, split at arbitrary offsets
    parse(new Uint8Array(a));
    parse(new Uint8Array(b.subarray(0, 3)));
    parse(new Uint8Array(b.subarray(3)));
    assert.deepEqual(
        seen.map((f) => f.type),
        ["head", "chunk"],
    );
    assert.equal(seen[1].b64, "aGk=");
});

test("frame parser: fails closed on oversize length prefix", () => {
    const saw = [];
    const parse = createFrameParser((f) => saw.push(f));
    const evil = Buffer.alloc(4);
    evil.writeUInt32BE(64 * 1024 * 1024, 0);
    parse(new Uint8Array(evil));
    assert.equal(saw.length, 1);
    assert.equal(saw[0].type, "fatal");
});

test("validateEnvelope: accepts chat completions to gen only", () => {
    const ok = validateEnvelope({
        id: VALID_ID,
        url: "https://gen.pollinations.ai/v1/chat/completions",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
    });
    assert.ok(ok);
    assert.equal(ok.url.hostname, "gen.pollinations.ai");

    assert.equal(
        validateEnvelope({
            id: VALID_ID,
            url: "https://evil.example.com/v1/chat/completions",
            method: "POST",
            headers: {},
            body: null,
        }),
        null,
    );
    // only the completions path is allowed
    assert.equal(
        validateEnvelope({
            id: VALID_ID,
            url: "https://gen.pollinations.ai/api/user/keys",
            method: "GET",
            headers: {},
            body: null,
        }),
        null,
    );
    // bad id
    assert.equal(
        validateEnvelope({
            id: "../escape",
            url: "https://gen.pollinations.ai/v1/chat/completions",
            method: "POST",
            headers: {},
            body: null,
        }),
        null,
    );
});

test("validateEnvelope: caps the request body", () => {
    const big = "x".repeat(5 * 1024 * 1024);
    assert.equal(
        validateEnvelope({
            id: VALID_ID,
            url: "https://gen.pollinations.ai/v1/chat/completions",
            method: "POST",
            headers: { "content-type": "application/json" },
            body: big,
        }),
        null,
    );
});

test("encodeChunk round-trips base64", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const encoded = encodeChunk(bytes);
    assert.deepEqual(Buffer.from(encoded, "base64"), Buffer.from(bytes));
});

async function runHost({ fetchImpl }) {
    const frames = [];
    const host = createBridgeHost({
        apiKey: "test-key",
        sendFrame: (f) => frames.push(f),
        fetchImpl,
        log: () => {},
    });
    await host.onFrame({
        type: "request",
        envelope: {
            id: VALID_ID,
            url: "https://gen.pollinations.ai/v1/chat/completions",
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: "Bearer should-be-stripped",
            },
            body: '{"messages":[]}',
        },
    });
    // let the streaming microtasks flush
    await new Promise((r) => setTimeout(r, 20));
    return { host, frames };
}

test("bridge host: forwards with real key, strips guest credentials", async () => {
    let seenHeaders = null;
    const { frames } = await runHost({
        fetchImpl: async (_url, init) => {
            seenHeaders = init.headers;
            return new Response('{"ok":true}', {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });
    assert.equal(seenHeaders.authorization, "Bearer test-key");
    const types = frames.map((f) => f.type);
    assert.deepEqual(types, ["head", "chunk", "end"]);
    assert.equal(frames[0].status, 200);
    assert.equal(
        Buffer.from(frames[1].b64, "base64").toString(),
        '{"ok":true}',
    );
    assert.equal(frames[2].error, undefined);
});

test("bridge host: 401 from upstream is surfaced, not swallowed", async () => {
    const { frames } = await runHost({
        fetchImpl: async () =>
            new Response('{"error":"unauthorized"}', {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
    });
    assert.equal(frames[0].status, 401);
});

test("bridge host: rejects invalid envelopes with 403", async () => {
    const frames = [];
    const host = createBridgeHost({
        apiKey: "k",
        sendFrame: (f) => frames.push(f),
        fetchImpl: async () => {
            throw new Error("must not be called");
        },
        log: () => {},
    });
    await host.onFrame({
        type: "request",
        envelope: {
            id: VALID_ID,
            url: "https://evil.example.com/v1/chat/completions",
            method: "POST",
            headers: {},
            body: null,
        },
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(frames[0].type, "head");
    assert.equal(frames[0].status, 403);
});

test("bridge host: connection errors end the request with an error frame", async () => {
    const { frames } = await runHost({
        fetchImpl: async () => {
            throw new Error("boom");
        },
    });
    const end = frames.find((f) => f.type === "end");
    assert.ok(end);
    assert.match(end.error, /boom/);
});

test("bridge host: pump rejects fail the guest request closed (413)", async () => {
    const frames = [];
    const host = createBridgeHost({
        apiKey: "k",
        sendFrame: (f) => frames.push(f),
        fetchImpl: async () => {
            throw new Error("must not be called");
        },
        log: () => {},
    });
    await host.onFrame({ type: "invalid", id: VALID_ID });
    await host.onFrame({ type: "oversize", id: VALID_ID });
    await host.onFrame(null);
    await host.onFrame({ type: "fatal", reason: "frame too large" });
    const heads = frames.filter((f) => f.type === "head");
    const ends = frames.filter((f) => f.type === "end");
    assert.equal(heads.length, 2);
    assert.equal(ends.length, 2);
    assert.deepEqual(
        heads.map((h) => h.status),
        [413, 413],
    );
});
