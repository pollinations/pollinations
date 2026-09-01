import assert from "node:assert/strict";
import test from "node:test";
import {
    beginOAuth,
    cleanCallbackUrl,
    createPkceChallenge,
    createRandomValue,
    disconnectOAuth,
    handleOAuthCallback,
    initializeOAuthStorage,
    OAUTH_CLIENT_ID,
    OAUTH_PENDING_STORAGE_KEY,
    OAUTH_PENDING_TTL_MS,
    OAUTH_TOKEN_STORAGE_KEY,
    parseOAuthCallback,
    readOAuthToken,
    redirectUriForLocation,
} from "./oauth.js";

function makeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return data.get(key) ?? null;
        },
        setItem(key, value) {
            data.set(key, value);
        },
        removeItem(key) {
            data.delete(key);
        },
        snapshot() {
            return Object.fromEntries(data);
        },
    };
}

function deterministicCrypto() {
    let fill = 1;
    return {
        getRandomValues(bytes) {
            bytes.fill(fill++);
            return bytes;
        },
        subtle: globalThis.crypto.subtle,
    };
}

async function pendingFor(storage, now = 1_700_000_000_000) {
    return (
        await beginOAuth({
            storage,
            location: { origin: "http://localhost:4173", pathname: "/" },
            cryptoImpl: deterministicCrypto(),
            now,
        })
    ).transaction;
}

test("RFC 7636 S256 challenge matches the published vector", async () => {
    assert.equal(
        await createPkceChallenge(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        ),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
});

test("random PKCE values use 32 bytes and 43 URL-safe characters", () => {
    const value = createRandomValue({
        getRandomValues: (bytes) => bytes.fill(255),
    });
    assert.equal(value.length, 43);
    assert.match(value, /^[A-Za-z0-9_-]+$/u);
});

test("only exact production and local root redirects are accepted", () => {
    assert.equal(
        redirectUriForLocation({
            origin: "https://pollen-craft.vercel.app",
            pathname: "/",
        }),
        "https://pollen-craft.vercel.app/",
    );
    assert.equal(
        redirectUriForLocation({
            origin: "http://localhost:4173",
            pathname: "/",
        }),
        "http://localhost:4173/",
    );
    assert.throws(
        () =>
            redirectUriForLocation({
                origin: "http://127.0.0.1:4173",
                pathname: "/",
            }),
        { code: "OAUTH_ORIGIN_UNSUPPORTED" },
    );
    assert.throws(
        () =>
            redirectUriForLocation({
                origin: "https://pollen-craft.vercel.app",
                pathname: "/nested",
            }),
        { code: "OAUTH_ORIGIN_UNSUPPORTED" },
    );
});

test("beginOAuth stores a bounded pending transaction and reuses it", async () => {
    const storage = makeStorage();
    const first = await beginOAuth({
        storage,
        location: { origin: "http://localhost:4173", pathname: "/" },
        cryptoImpl: deterministicCrypto(),
        now: 1_700_000_000_000,
    });
    const second = await beginOAuth({
        storage,
        location: { origin: "http://localhost:4173", pathname: "/" },
        cryptoImpl: deterministicCrypto(),
        now: 1_700_000_000_001,
    });
    const params = new URL(second.authorizationUrl).searchParams;
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(params.get("response_type"), "code");
    assert.equal(params.get("client_id"), OAUTH_CLIENT_ID);
    assert.equal(params.get("redirect_uri"), "http://localhost:4173/");
    assert.equal(params.get("code_challenge_method"), "S256");
    assert.equal(params.has("scope"), false);
    assert.equal(second.transaction.state, first.transaction.state);
    assert.equal(second.transaction.verifier, first.transaction.verifier);
    assert.equal(
        JSON.parse(storage.snapshot()[OAUTH_PENDING_STORAGE_KEY]).version,
        1,
    );
});

test("expired and future pending transactions are not reused", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    await pendingFor(storage, now);
    const expired = await beginOAuth({
        storage,
        location: { origin: "http://localhost:4173", pathname: "/" },
        cryptoImpl: deterministicCrypto(),
        now: now + OAUTH_PENDING_TTL_MS + 1,
    });
    assert.equal(expired.reused, false);
    const futureStorage = makeStorage({
        [OAUTH_PENDING_STORAGE_KEY]: JSON.stringify({
            ...expired.transaction,
            createdAt: now + 10,
        }),
    });
    const future = await beginOAuth({
        storage: futureStorage,
        location: { origin: "http://localhost:4173", pathname: "/" },
        cryptoImpl: deterministicCrypto(),
        now,
    });
    assert.equal(future.reused, false);
});

test("malformed pending records are cleared before a fresh transaction", async () => {
    const storage = makeStorage({
        [OAUTH_PENDING_STORAGE_KEY]: JSON.stringify({
            version: 99,
            state: "not-a-state",
        }),
    });
    const result = await beginOAuth({
        storage,
        location: { origin: "http://localhost:4173", pathname: "/" },
        cryptoImpl: deterministicCrypto(),
        now: 1_700_000_000_000,
    });
    assert.equal(result.reused, false);
    assert.equal(result.transaction.version, 1);
    assert.equal(
        JSON.parse(storage.snapshot()[OAUTH_PENDING_STORAGE_KEY]).state,
        result.transaction.state,
    );
});

test("callback cleanup removes every auth parameter and preserves safe URL parts", () => {
    const location =
        "http://localhost:4173/?keep=1&code=one&state=two&error_uri=x#view?keep=2&error=y";
    assert.equal(cleanCallbackUrl(location), "/?keep=1#view?keep=2");
    const parsed = parseOAuthCallback(location);
    assert.equal(parsed.kind, "invalid");
    assert.equal(parsed.cleanedUrl, "/?keep=1#view?keep=2");
});

test("callback requires one state and exactly one code or error", () => {
    for (const query of [
        "code=one",
        "code=one&state=a&state=b",
        "code=one&error=denied&state=a",
        "code=one&code=two&state=a",
        "error=denied&error=again&state=a",
        "state=a",
    ]) {
        const result = parseOAuthCallback(`http://localhost:4173/?${query}`);
        assert.equal(result.kind, "invalid", query);
    }
});

test("wrong callback state preserves the pending transaction and never exchanges", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    const pending = await pendingFor(storage, now);
    let calls = 0;
    let cleanedUrl = null;
    const result = await handleOAuthCallback({
        storage,
        location: `http://localhost:4173/?code=oauth-code&state=wrong&safe=1`,
        history: {
            replaceState: (_state, _title, url) => {
                cleanedUrl = url;
            },
        },
        fetchImpl: async () => {
            calls += 1;
            throw new Error("should not be called");
        },
        now,
    });
    assert.equal(result.error.code, "OAUTH_STATE_MISMATCH");
    assert.equal(cleanedUrl, "/?safe=1");
    assert.equal(calls, 0);
    assert.equal(
        JSON.parse(storage.snapshot()[OAUTH_PENDING_STORAGE_KEY]).state,
        pending.state,
    );
});

test("matching callback consumes pending before one exact token exchange", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    const pending = await pendingFor(storage, now);
    const requests = [];
    const result = await handleOAuthCallback({
        storage,
        location: `http://localhost:4173/?code=oauth-code&state=${pending.state}&safe=1`,
        history: { replaceState: () => {} },
        fetchImpl: async (url, options) => {
            requests.push({ url, options });
            assert.equal(storage.getItem(OAUTH_PENDING_STORAGE_KEY), null);
            return new Response(
                JSON.stringify({
                    access_token: "sk_test_12345678",
                    token_type: "BeArEr",
                    expires_in: 60,
                }),
                {
                    status: 200,
                    headers: { "content-type": "application/json" },
                },
            );
        },
        now,
    });
    assert.equal(result.kind, "success");
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0].url,
        "https://enter.pollinations.ai/api/oauth/token",
    );
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(
        requests[0].options.headers["Content-Type"],
        "application/x-www-form-urlencoded",
    );
    assert.deepEqual(
        Object.fromEntries(new URLSearchParams(requests[0].options.body)),
        {
            grant_type: "authorization_code",
            code: "oauth-code",
            client_id: OAUTH_CLIENT_ID,
            redirect_uri: "http://localhost:4173/",
            code_verifier: pending.verifier,
        },
    );
    assert.deepEqual(JSON.parse(storage.snapshot()[OAUTH_TOKEN_STORAGE_KEY]), {
        token: "sk_test_12345678",
        expiresAt: 1_700_000_060_000,
    });
    assert.equal(storage.snapshot()["pollen-craft:key"], undefined);
});

test("a callback replay is rejected without a second token exchange", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    const pending = await pendingFor(storage, now);
    let calls = 0;
    const callback = {
        storage,
        location: `http://localhost:4173/?code=oauth-code&state=${pending.state}`,
        history: { replaceState: () => {} },
        fetchImpl: async () => {
            calls += 1;
            return new Response(
                JSON.stringify({
                    access_token: "sk_test_12345678",
                    token_type: "bearer",
                }),
                { status: 200 },
            );
        },
        now,
    };
    assert.equal((await handleOAuthCallback(callback)).kind, "success");
    const replay = await handleOAuthCallback(callback);
    assert.equal(replay.error.code, "OAUTH_NO_PENDING");
    assert.equal(calls, 1);
});

test("provider callback errors are safe and consume a matching pending transaction", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    const pending = await pendingFor(storage, now);
    const result = await handleOAuthCallback({
        storage,
        location: `http://localhost:4173/?error=access_denied&error_description=secret&error_uri=https%3A%2F%2Fbad&state=${pending.state}`,
        history: { replaceState: () => {} },
        fetchImpl: async () => {
            throw new Error("must not exchange an error callback");
        },
        now,
    });
    assert.equal(result.error.code, "OAUTH_ACCESS_DENIED");
    assert.equal(result.error.message, "Wallet connection was cancelled.");
    assert.equal(storage.getItem(OAUTH_PENDING_STORAGE_KEY), null);
    assert.equal(result.error.message.includes("secret"), false);
});

test("malformed, expired, and missing tokens are cleared without exposing values", () => {
    const storage = makeStorage({
        [OAUTH_TOKEN_STORAGE_KEY]: JSON.stringify({
            token: "sk_test_12345678",
            expiresAt: 10,
        }),
    });
    assert.equal(readOAuthToken(storage, 10), null);
    assert.equal(storage.getItem(OAUTH_TOKEN_STORAGE_KEY), null);
    storage.setItem(OAUTH_TOKEN_STORAGE_KEY, "not json");
    assert.equal(readOAuthToken(storage, 0), null);
    assert.equal(storage.getItem(OAUTH_TOKEN_STORAGE_KEY), null);
});

test("startup auth initialization removes the legacy key but preserves tab state", () => {
    const now = 1_700_000_000_000;
    const storage = makeStorage({
        [OAUTH_TOKEN_STORAGE_KEY]: JSON.stringify({
            token: "sk_test_12345678",
            expiresAt: now + 60_000,
        }),
        ["pollen-craft:key"]: "sk_legacy_12345678",
        unrelated: "keep me",
    });
    const modelStorage = makeStorage({
        "pollen-craft:text-model:v2": "openai-fast",
    });
    initializeOAuthStorage(storage);
    assert.equal(storage.getItem("pollen-craft:key"), null);
    assert.equal(storage.getItem("unrelated"), "keep me");
    assert.deepEqual(readOAuthToken(storage, now), {
        token: "sk_test_12345678",
        expiresAt: now + 60_000,
    });
    assert.equal(
        modelStorage.getItem("pollen-craft:text-model:v2"),
        "openai-fast",
    );

    const blockedStorage = {
        getItem: () => "sk_legacy_12345678",
        removeItem: () => {
            throw new Error("storage blocked");
        },
    };
    assert.doesNotThrow(() => initializeOAuthStorage(blockedStorage));
});

test("disconnect clears OAuth and legacy tab state without touching local storage", async () => {
    const storage = makeStorage({
        [OAUTH_TOKEN_STORAGE_KEY]: JSON.stringify({
            token: "sk_test_12345678",
            expiresAt: null,
        }),
        [OAUTH_PENDING_STORAGE_KEY]: "pending",
        ["pollen-craft:key"]: "sk_legacy_12345678",
    });
    const localStorage = makeStorage({ secret: "must-remain" });
    const pending = await pendingFor(storage, 1_700_000_000_000);
    assert.ok(pending);
    assert.ok(storage.snapshot()[OAUTH_PENDING_STORAGE_KEY]);
    disconnectOAuth(storage);
    assert.equal(storage.getItem(OAUTH_TOKEN_STORAGE_KEY), null);
    assert.equal(storage.getItem(OAUTH_PENDING_STORAGE_KEY), null);
    assert.equal(storage.getItem("pollen-craft:key"), null);
    assert.equal(localStorage.getItem("secret"), "must-remain");
});

test("HTTP and malformed token responses use fixed safe errors", async () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;
    const pending = await pendingFor(storage, now);
    for (const response of [
        new Response("provider secret", { status: 401 }),
        new Response("{", { status: 200 }),
        new Response(
            JSON.stringify({
                access_token: "pk_not_a_secret",
                token_type: "bearer",
            }),
            { status: 200 },
        ),
    ]) {
        const isolated = makeStorage({
            [OAUTH_PENDING_STORAGE_KEY]: JSON.stringify(pending),
        });
        const result = await handleOAuthCallback({
            storage: isolated,
            location: `http://localhost:4173/?code=oauth-code&state=${pending.state}`,
            history: { replaceState: () => {} },
            fetchImpl: async () => response,
            now,
        });
        assert.match(result.error.code, /^OAUTH_TOKEN_/u);
        assert.equal(result.error.message.includes("provider secret"), false);
        assert.equal(result.error.message.includes("oauth-code"), false);
    }
});
