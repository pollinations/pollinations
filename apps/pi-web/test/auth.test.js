import assert from "node:assert/strict";
import test from "node:test";
import { AuthStore, authorizeUrl, parseAuthFragment } from "../src/auth.js";

test("parses a synthetic success fragment", () => {
    assert.deepEqual(parseAuthFragment("#api_key=sk_abc123xyz&state=s1"), {
        key: "sk_abc123xyz",
        state: "s1",
    });
});

test("parses a synthetic denial fragment", () => {
    assert.deepEqual(parseAuthFragment("#error=access_denied&state=s1"), {
        error: "access_denied",
        state: "s1",
    });
});

test("rejects malformed keys and empty fragments", () => {
    assert.deepEqual(parseAuthFragment("#api_key=pk_wrongkind"), {
        error: "malformed_key",
        state: null,
    });
    assert.equal(parseAuthFragment(""), null);
    assert.equal(parseAuthFragment("#"), null);
    assert.equal(parseAuthFragment("#state=only"), null);
});

test("authorize url omits client_id (hostname fallback) and keeps state", () => {
    const url = new URL(authorizeUrl("https://example.com/app", "s1"));
    assert.equal(
        url.origin + url.pathname,
        "https://enter.pollinations.ai/authorize",
    );
    assert.equal(
        url.searchParams.get("redirect_uri"),
        "https://example.com/app",
    );
    assert.equal(url.searchParams.get("client_id"), null);
    assert.equal(url.searchParams.get("state"), "s1");
});

test("store keeps the key in sessionStorage and scrubs the fragment", () => {
    const mem = new Map();
    const storage = {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
    };
    const store = new AuthStore(storage);
    let scrubbed = false;
    const st = store.beginAuthorize();
    const result = store.consumeFragment(`#api_key=sk_live&state=${st}`, () => {
        scrubbed = true;
    });
    assert.equal(result.connected, true);
    assert.equal(scrubbed, true);
    assert.equal(store.getKey(), "sk_live");
    assert.equal(store.getKeyGen(), 1);
    store.clear();
    assert.equal(store.getKey(), null);
    assert.equal(store.getKeyGen(), 2);
});

test("denial surfaces an error and stores nothing", () => {
    const mem = new Map();
    const storage = {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
    };
    const store = new AuthStore(storage);
    const st = store.beginAuthorize();
    const result = store.consumeFragment(
        `#error=access_denied&state=${st}`,
        () => {},
    );
    assert.deepEqual(result, { connected: false, error: "access_denied" });
    assert.equal(store.getKey(), null);
});

test("state mismatch rejects the fragment, matching state connects", () => {
    const mem = new Map();
    const storage = {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
    };
    const store = new AuthStore(storage);
    store.beginAuthorize();
    const bad = store.consumeFragment("#api_key=sk_evil&state=wrong", () => {});
    assert.deepEqual(bad, { connected: false, error: "state_mismatch" });
    assert.equal(store.getKey(), null);
    const state2 = store.beginAuthorize();
    const good = store.consumeFragment(
        `#api_key=sk_real&state=${state2}`,
        () => {},
    );
    assert.equal(good.connected, true);
    assert.equal(store.getKey(), "sk_real");
});

test("unsolicited fragments (no pending authorize flow) are rejected fail-closed", () => {
    const mem = new Map();
    const storage = {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
    };
    const store = new AuthStore(storage);
    const result = store.consumeFragment("#api_key=sk_direct", () => {});
    assert.deepEqual(result, { connected: false, error: "state_mismatch" });
    assert.equal(store.getKey(), null);
    // direct key entry goes through the explicit paste flow instead
    store.setKey("sk_direct");
    assert.equal(store.getKey(), "sk_direct");
});
