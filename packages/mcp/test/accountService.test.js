import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const ANON = {};
const KEY_ID = "a".repeat(32);

const handlers = new Map(
    accountTools.map(([name, , , handler]) => [name, handler]),
);
const call = (name, params = {}, context = CONTEXT) =>
    handlers.get(name)(params, context);

/** Stubs global fetch and returns the recorded calls plus the last body. */
function stubFetch(t, respond) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        return respond(url, init);
    };
    return calls;
}

const payload = (data) => Response.json(data);
const body = (response) => JSON.parse(response.content[0].text);

test("getUsage requests history with the CLI's filter parameters", async (t) => {
    const calls = stubFetch(t, () => payload({ usage: [], count: 0 }));

    const result = await call("getUsage", {
        days: 7,
        limit: 5,
        model: ["openai/gpt-5.4-nano", "google/gemini-3.8-flash"],
        key: [KEY_ID],
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, "/account/usage");
    assert.equal(calls[0].url.searchParams.get("days"), "7");
    assert.equal(calls[0].url.searchParams.get("limit"), "5");
    assert.equal(
        calls[0].url.searchParams.get("models"),
        "openai/gpt-5.4-nano,google/gemini-3.8-flash",
    );
    assert.equal(calls[0].url.searchParams.get("api_key_ids"), KEY_ID);
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(body(result), { usage: [], count: 0 });
});

test("getUsage daily skips the unsupported limit parameter", async (t) => {
    const calls = stubFetch(t, () => payload({ usage: [], count: 0 }));

    await call("getUsage", { daily: true, days: 30, limit: 5 });

    assert.equal(calls[0].url.pathname, "/account/usage/daily");
    assert.equal(calls[0].url.searchParams.get("days"), "30");
    assert.equal(calls[0].url.searchParams.has("limit"), false);
});

test("getUsage resolves key names through /account/keys and ids as-is", async (t) => {
    const calls = stubFetch(t, (url) => {
        if (url.pathname === "/account/keys") {
            return payload({ data: [{ id: KEY_ID, name: "my-bot" }] });
        }
        return payload({ usage: [], count: 0 });
    });

    await call("getUsage", { key: ["my-bot"] });
    assert.deepEqual(
        calls.map((entry) => entry.url.pathname),
        ["/account/keys", "/account/usage"],
    );
    assert.equal(calls[1].url.searchParams.get("api_key_ids"), KEY_ID);

    const idOnly = stubFetch(t, () => payload({ usage: [], count: 0 }));
    await call("getUsage", { key: [KEY_ID] });
    assert.equal(idOnly.length, 1);
    assert.equal(idOnly[0].url.pathname, "/account/usage");
});

test("getUsage fails loudly on an unknown key name", async (t) => {
    stubFetch(t, () => payload({ data: [{ id: KEY_ID, name: "my-bot" }] }));

    await assert.rejects(
        call("getUsage", { key: ["nope"] }),
        /Unknown key "nope"/,
    );
});

test("getEarnings and listQuests hit their endpoints", async (t) => {
    const calls = stubFetch(t, () => payload({ quests: [] }));

    await call("getEarnings", { days: 30 });
    assert.equal(calls[0].url.pathname, "/account/earnings");
    assert.equal(calls[0].url.searchParams.get("days"), "30");

    await call("listQuests", {});
    assert.equal(calls[1].url.pathname, "/account/quests");
});

test("listQuests filters by derived claim state", async (t) => {
    const quests = [
        { id: "a", state: "available" },
        { id: "b", state: "completed" },
        { id: "c", state: "coming_soon" },
        { id: "d", state: "available", reward: { claimedAt: null } },
        { id: "e", state: "available", reward: { claimedAt: "2026-01-01" } },
    ];
    stubFetch(t, () => payload({ quests }));

    assert.deepEqual(
        body(await call("listQuests", { state: "claimable" })).quests,
        [{ id: "d", state: "available", reward: { claimedAt: null } }],
    );
    assert.deepEqual(
        body(await call("listQuests", { state: "claimed" })).quests.map(
            (q) => q.id,
        ),
        ["b", "e"],
    );
    assert.deepEqual(
        body(await call("listQuests", { state: "coming-soon" })).quests.map(
            (q) => q.id,
        ),
        ["c"],
    );
    assert.equal(body(await call("listQuests", {})).quests.length, 5);
});

test("listKeys reads the account key list", async (t) => {
    const calls = stubFetch(t, () => payload({ data: [{ id: KEY_ID }] }));

    const result = await call("listKeys", {});
    assert.equal(calls[0].url.pathname, "/account/keys");
    assert.equal(calls[0].init.method, undefined);
    assert.deepEqual(body(result), { data: [{ id: KEY_ID }] });
});

test("createKey posts the CLI's key options as their API body fields", async (t) => {
    const calls = stubFetch(t, () =>
        payload({ id: KEY_ID, key: "sk_new", name: "my-bot" }),
    );

    const result = await call("createKey", {
        name: "my-bot",
        type: "secret",
        expiresIn: 3600,
        models: ["openai/gpt-5.4-nano"],
        budget: 5,
        permissions: ["usage", "keys"],
    });

    assert.equal(calls[0].url.pathname, "/account/keys");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        name: "my-bot",
        type: "secret",
        expiresIn: 3600,
        allowedModels: ["openai/gpt-5.4-nano"],
        pollenBudget: 5,
        accountPermissions: ["usage", "keys"],
    });
    assert.equal(body(result).key, "sk_new");
});

test("revokeKey deletes the key by id", async (t) => {
    const calls = stubFetch(t, () => payload({ success: true }));

    await call("revokeKey", { id: KEY_ID });
    assert.equal(calls[0].url.pathname, `/account/keys/${KEY_ID}`);
    assert.equal(calls[0].init.method, "DELETE");
});

test("account tools surface the API's own error message", async (t) => {
    stubFetch(t, () =>
        Response.json(
            { message: "missing account permission" },
            { status: 403 },
        ),
    );

    await assert.rejects(call("listKeys", {}), /missing account permission/);
});

test("account tools require an API key", async () => {
    await assert.rejects(call("listKeys", {}, ANON), /API key required/);
});
