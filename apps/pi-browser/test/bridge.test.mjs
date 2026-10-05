import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BRIDGE_DIR,
    buildForward,
    encodeResponse,
    fromBase64,
    KEY_PLACEHOLDER,
    normalizeEntries,
    pumpBridge,
    toBase64,
} from "../src/bridge.js";

const GEN = "https://gen.pollinations.ai";

test("normalizeEntries accepts strings and {name} entries, keeps only .json", () => {
    assert.deepEqual(
        normalizeEntries(["a.json", "b.txt", { name: "c.json" }, null, 42]),
        ["a.json", "c.json"],
    );
    assert.deepEqual(normalizeEntries(undefined), []);
    assert.deepEqual(normalizeEntries(null), []);
});

test("buildForward injects the visitor key for gateway requests", () => {
    const forward = buildForward(
        {
            url: `${GEN}/v1/chat/completions`,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        },
        { key: "sk_real", genOrigin: GEN },
    );
    assert.equal(forward.headers.authorization, "Bearer sk_real");
    assert.equal(forward.body, "{}");
    assert.equal(forward.method, "POST");
});

test("buildForward leaves other origins alone", () => {
    const forward = buildForward(
        { url: "https://example.com/x", method: "GET", headers: {} },
        { key: "sk_real", genOrigin: GEN },
    );
    assert.equal(forward.headers.authorization, undefined);
});

test("buildForward replaces placeholder values and strips hop-by-hop headers", () => {
    const forward = buildForward(
        {
            url: `${GEN}/v1/models`,
            method: "GET",
            headers: {
                host: "gen.pollinations.ai",
                cookie: "session=1",
                "content-length": "12",
                "x-keep": `Bearer ${KEY_PLACEHOLDER}`,
            },
        },
        { key: "sk_real", genOrigin: GEN },
    );
    assert.equal(forward.headers.host, undefined);
    assert.equal(forward.headers.cookie, undefined);
    assert.equal(forward.headers["content-length"], undefined);
    assert.equal(forward.headers["x-keep"], "Bearer sk_real");
});

test("buildForward drops placeholder headers when no key was provided", () => {
    const forward = buildForward(
        {
            url: `${GEN}/v1/models`,
            method: "GET",
            headers: { authorization: `Bearer ${KEY_PLACEHOLDER}` },
        },
        { key: "", genOrigin: GEN },
    );
    assert.equal(forward.headers.authorization, undefined);
});

test("base64 helpers round-trip, including multi-chunk bodies", () => {
    const small = new Uint8Array([0, 1, 2, 255]);
    assert.deepEqual([...fromBase64(toBase64(small))], [...small]);

    const large = new Uint8Array(0x8000 * 2 + 7);
    for (let i = 0; i < large.length; i += 1) large[i] = i % 256;
    assert.deepEqual([...fromBase64(toBase64(large))], [...large]);
});

test("encodeResponse captures status, headers and body", async () => {
    const encoded = await encodeResponse(
        new Response("hello", {
            status: 201,
            headers: { "content-type": "text/plain" },
        }),
    );
    assert.equal(encoded.status, 201);
    assert.equal(encoded.headers["content-type"], "text/plain");
    assert.equal(new TextDecoder().decode(fromBase64(encoded.body)), "hello");
});

/** Minimal in-memory stand-in for the SDK sandbox filesystem. */
function fakeFs({ dirs = {}, texts = {} } = {}) {
    const written = {};
    return {
        written,
        async readDir(path) {
            const entries = dirs[path];
            if (!entries)
                throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            return entries;
        },
        async readText(path) {
            const value = texts[path];
            if (value === undefined) {
                throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            }
            return value;
        },
        async writeText(path, value) {
            written[path] = value;
        },
    };
}

const pendingName = "task-1.json";

function queuedRequest(overrides = {}) {
    return JSON.stringify({
        url: `${GEN}/v1/chat/completions`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"prompt":"hi"}',
        ...overrides,
    });
}

test("pumpBridge forwards a pending request and answers it", async () => {
    const fs = fakeFs({
        dirs: { [`${BRIDGE_DIR}/pending`]: [pendingName] },
        texts: { [`${BRIDGE_DIR}/pending/${pendingName}`]: queuedRequest() },
    });
    const seen = [];
    const fetchImpl = async (url, init) => {
        seen.push({ url, init });
        return new Response("ok", { status: 200 });
    };
    const events = [];
    const handled = new Set();

    const count = await pumpBridge({
        fs,
        key: "sk_real",
        genOrigin: GEN,
        fetchImpl,
        onEvent: (event) => events.push(event),
        handled,
    });

    assert.equal(count, 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, `${GEN}/v1/chat/completions`);
    assert.equal(seen[0].init.headers.authorization, "Bearer sk_real");
    const done = JSON.parse(fs.written[`${BRIDGE_DIR}/done/${pendingName}`]);
    assert.equal(done.status, 200);
    assert.equal(new TextDecoder().decode(fromBase64(done.body)), "ok");
    assert.equal(events[0].status, 200);
    assert.equal(events[0].error, undefined);

    // Same name again: already handled, must not be forwarded twice.
    const again = await pumpBridge({
        fs,
        key: "sk_real",
        genOrigin: GEN,
        fetchImpl,
        handled,
    });
    assert.equal(again, 0);
    assert.equal(seen.length, 1);
});

test("pumpBridge reports fetch failures as an error payload", async () => {
    const fs = fakeFs({
        dirs: { [`${BRIDGE_DIR}/pending`]: [pendingName] },
        texts: { [`${BRIDGE_DIR}/pending/${pendingName}`]: queuedRequest() },
    });
    const fetchImpl = async () => {
        throw new TypeError("Failed to fetch");
    };
    const events = [];
    await pumpBridge({
        fs,
        key: "sk_real",
        genOrigin: GEN,
        fetchImpl,
        onEvent: (event) => events.push(event),
    });
    const done = JSON.parse(fs.written[`${BRIDGE_DIR}/done/${pendingName}`]);
    assert.equal(done.error, "Failed to fetch");
    assert.equal(events[0].error, true);
    assert.equal(events[0].status, 0);
});

test("pumpBridge does nothing when the queue does not exist yet", async () => {
    const count = await pumpBridge({
        fs: fakeFs(),
        key: "",
        genOrigin: GEN,
        fetchImpl: async () => new Response("never"),
    });
    assert.equal(count, 0);
});

test("pumpBridge enforces maxBatch", async () => {
    const names = ["a.json", "b.json", "c.json"];
    const fs = fakeFs({
        dirs: { [`${BRIDGE_DIR}/pending`]: names },
        texts: Object.fromEntries(
            names.map((name) => [
                `${BRIDGE_DIR}/pending/${name}`,
                queuedRequest(),
            ]),
        ),
    });
    let calls = 0;
    const count = await pumpBridge({
        fs,
        key: "sk_real",
        genOrigin: GEN,
        fetchImpl: async () => {
            calls += 1;
            return new Response("", { status: 200 });
        },
        maxBatch: 2,
    });
    assert.equal(count, 2);
    assert.equal(calls, 2);
});
