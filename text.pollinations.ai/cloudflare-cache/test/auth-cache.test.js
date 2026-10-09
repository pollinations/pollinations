import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import worker, {
    generateCacheKey,
    getReferrerIdentity,
    hasLegacyToken,
    isCacheableResponse,
} from "../src/index.js";

// Node's Request needs `duplex: "half"` to forward a streamed body, which the
// Workers runtime does not. Only a test shim; the worker code is unchanged.
const NativeRequest = globalThis.Request;
class TestRequest extends NativeRequest {
    constructor(input, init) {
        super(input, init?.body ? { duplex: "half", ...init } : init);
    }
}

const REGISTERED_REFERRER = "registered-app.example";
const MIGRATION = {
    error: "Authenticated requests are no longer served by the legacy text API",
    status: 403,
    code: "legacy_auth_migration_required",
    migration_url: "https://enter.pollinations.ai",
};

// Simulates text.pollinations.ai: valid tokens and registered referrers get
// the non-cacheable migration error, everyone else gets a model answer.
function fakeOrigin(request, body) {
    const url = new URL(request.url);
    const auth =
        request.headers.get("authorization") ||
        request.headers.get("x-pollinations-token") ||
        url.searchParams.get("token") ||
        body?.token;
    const referrer =
        url.searchParams.get("referrer") ||
        body?.referrer ||
        request.headers.get("referer") ||
        "";
    if (auth || referrer.includes(REGISTERED_REFERRER)) {
        const payload = JSON.stringify(MIGRATION);
        return new Response(payload, {
            status: 403,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "content-length": String(Buffer.byteLength(payload)),
                "cache-control": "private, no-store",
            },
        });
    }
    const payload = JSON.stringify({
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "anonymous answer" } }],
    });
    return new Response(payload, {
        status: 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "content-length": String(Buffer.byteLength(payload)),
            "cache-control": "public, max-age=31536000, immutable",
        },
    });
}

function createBucket() {
    const store = new Map();
    return {
        store,
        async get(key) {
            const entry = store.get(key);
            if (!entry) return null;
            return {
                body: new Blob([entry.value]).stream(),
                size: entry.value.byteLength,
                uploaded: new Date(0),
                customMetadata: entry.customMetadata,
                text: async () => new TextDecoder().decode(entry.value),
            };
        },
        async put(key, value, options = {}) {
            const bytes =
                typeof value === "string"
                    ? new TextEncoder().encode(value)
                    : new Uint8Array(value);
            store.set(key, {
                value: bytes,
                customMetadata: options.customMetadata,
            });
        },
    };
}

let env;
let originCalls;
const originalFetch = globalThis.fetch;

beforeEach(() => {
    originCalls = 0;
    env = { ORIGIN_HOST: "origin.test", TEXT_BUCKET: createBucket() };
    globalThis.Request = TestRequest;
    globalThis.fetch = async (request) => {
        originCalls++;
        const text = await request.text();
        return fakeOrigin(request, text ? JSON.parse(text) : null);
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.Request = NativeRequest;
});

const chatBody = JSON.stringify({
    model: "openai",
    messages: [{ role: "user", content: "same prompt" }],
});

function post(headers = {}, body = chatBody, path = "/openai") {
    return new Request(`https://text.pollinations.ai${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
    });
}

async function send(request) {
    const pending = [];
    const response = await worker.fetch(request, env, {
        waitUntil: (promise) => pending.push(promise),
    });
    const text = await response.text();
    await Promise.all(pending);
    return { response, text };
}

function mainCacheEntries() {
    return [...env.TEXT_BUCKET.store.keys()].filter(
        (key) => !key.endsWith("-request"),
    );
}

const credentialCases = [
    ["Authorization header", () => post({ authorization: "Bearer sk_test" })],
    ["x-pollinations-token header", () => post({ "x-pollinations-token": "sk_test" })],
    [
        "token query parameter",
        () => post({}, chatBody, "/openai?token=sk_test"),
    ],
    [
        "token body field",
        () => post({}, JSON.stringify({ ...JSON.parse(chatBody), token: "sk_test" })),
    ],
    [
        "registered referrer body field",
        () =>
            post(
                {},
                JSON.stringify({
                    ...JSON.parse(chatBody),
                    referrer: REGISTERED_REFERRER,
                }),
            ),
    ],
    [
        "registered Referer header",
        () => post({ referer: `https://${REGISTERED_REFERRER}/app` }),
    ],
];

for (const [name, makeAuthRequest] of credentialCases) {
    test(`anonymous then authenticated (${name}): no anonymous cache hit`, async () => {
        const anon = await send(post());
        assert.equal(anon.response.status, 200);
        assert.match(anon.text, /anonymous answer/);
        assert.equal(mainCacheEntries().length, 1);

        const authed = await send(makeAuthRequest());
        assert.equal(authed.response.status, 403);
        assert.notEqual(authed.response.headers.get("x-cache"), "HIT");
        assert.equal(JSON.parse(authed.text).code, MIGRATION.code);
        assert.equal(originCalls, 2);
        assert.equal(mainCacheEntries().length, 1);
    });

    test(`authenticated then anonymous (${name}): migration notice is never cached`, async () => {
        const authed = await send(makeAuthRequest());
        assert.equal(authed.response.status, 403);
        assert.equal(JSON.parse(authed.text).code, MIGRATION.code);
        assert.equal(mainCacheEntries().length, 0);

        const anon = await send(post());
        assert.equal(anon.response.status, 200);
        assert.match(anon.text, /anonymous answer/);
        assert.doesNotMatch(anon.text, /legacy_auth_migration_required/);
        assert.equal(originCalls, 2);
    });
}

test("anonymous requests still share cache entries", async () => {
    const first = await send(post());
    const second = await send(post());
    assert.equal(first.response.status, 200);
    assert.equal(second.response.headers.get("x-cache"), "HIT");
    assert.equal(second.text, first.text);
    assert.equal(originCalls, 1);
});

test("GET prompt with a token query parameter bypasses the cache", async () => {
    const url = "https://text.pollinations.ai/hello%20world";
    const anon = await send(new Request(url));
    assert.equal(anon.response.status, 200);

    const authed = await send(new Request(`${url}?token=sk_test`));
    assert.equal(authed.response.status, 403);
    assert.equal(JSON.parse(authed.text).code, MIGRATION.code);
    assert.equal(mainCacheEntries().length, 1);
});

test("cache key for requests without a referrer is unchanged", async () => {
    const expected = createHash("sha256")
        .update(`POST|/openai||${JSON.stringify(JSON.parse(chatBody))}`)
        .digest("hex");
    assert.equal(await generateCacheKey(post()), expected);
});

test("cache key ignores the token but separates referrers", async () => {
    const base = await generateCacheKey(post());
    assert.equal(
        await generateCacheKey(post({}, chatBody, "/openai?token=sk_test")),
        base,
    );
    const refA = await generateCacheKey(post({ referer: "https://a.example/x" }));
    const refA2 = await generateCacheKey(
        post({}, chatBody, "/openai?referrer=A.example"),
    );
    const refB = await generateCacheKey(post({ referer: "https://b.example/" }));
    assert.notEqual(refA, base);
    assert.equal(refA, refA2);
    assert.notEqual(refA, refB);
});

test("credential helpers", async () => {
    assert.equal(await hasLegacyToken(post()), false);
    assert.equal(await hasLegacyToken(post({ authorization: "Bearer x" })), true);
    assert.equal(
        await hasLegacyToken(post({}, JSON.stringify({ token: "" }))),
        false,
    );
    assert.equal(await hasLegacyToken(post({}, "not json")), false);
    assert.equal(await getReferrerIdentity(post()), "");
    assert.equal(
        await getReferrerIdentity(post({ origin: "https://App.Example:8080" })),
        "app.example",
    );
});

test("isCacheableResponse rejects errors and private / no-store", () => {
    assert.equal(isCacheableResponse(new Response("ok")), true);
    assert.equal(
        isCacheableResponse(
            new Response("ok", { headers: { "cache-control": "no-cache" } }),
        ),
        true,
    );
    assert.equal(isCacheableResponse(new Response("x", { status: 403 })), false);
    assert.equal(
        isCacheableResponse(
            new Response("x", { headers: { "cache-control": "private, no-store" } }),
        ),
        false,
    );
    assert.equal(
        isCacheableResponse(
            new Response("x", { headers: { "Cache-Control": "No-Store" } }),
        ),
        false,
    );
});
