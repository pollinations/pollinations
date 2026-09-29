import assert from "node:assert/strict";
import test from "node:test";
import {
    createKey,
    getEarnings,
    getUsage,
    listKeys,
    listQuests,
    revokeKey,
} from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

function withFetch(t, handler) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        return handler(url, init);
    };
    return calls;
}

test("getUsage requests /account/usage with days, models and key filters", async (t) => {
    const calls = withFetch(t, (url) => {
        assert.equal(url.pathname, "/account/usage");
        assert.equal(url.searchParams.get("days"), "7");
        assert.equal(url.searchParams.get("limit"), "10");
        assert.equal(url.searchParams.get("models"), "flux,turbo");
        assert.equal(url.searchParams.get("api_key_ids"), "key1,key2");
        return Response.json({ usage: [], count: 0 });
    });

    await getUsage(
        {
            days: 7,
            limit: 10,
            models: ["flux", "turbo"],
            apiKeyIds: ["key1", "key2"],
        },
        CONTEXT,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
});

test("getUsage requests /account/usage/daily and omits limit/models", async (t) => {
    const calls = withFetch(t, (url) => {
        assert.equal(url.pathname, "/account/usage/daily");
        assert.equal(url.searchParams.get("days"), "30");
        assert.equal(url.searchParams.has("limit"), false);
        assert.equal(url.searchParams.has("models"), false);
        return Response.json({ usage: [], count: 0 });
    });

    await getUsage({ daily: true, days: 30 }, CONTEXT);

    assert.equal(calls.length, 1);
});

test("getEarnings requests /account/earnings with days", async (t) => {
    withFetch(t, (url) => {
        assert.equal(url.pathname, "/account/earnings");
        assert.equal(url.searchParams.get("days"), "14");
        return Response.json({ daily: [], perEntity: [] });
    });

    const result = await getEarnings({ days: 14 }, CONTEXT);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        daily: [],
        perEntity: [],
    });
});

test("listQuests requests /account/quests", async (t) => {
    withFetch(t, (url) => {
        assert.equal(url.pathname, "/account/quests");
        return Response.json({ quests: [] });
    });

    await listQuests({}, CONTEXT);
});

test("listKeys requests /account/keys", async (t) => {
    withFetch(t, (url) => {
        assert.equal(url.pathname, "/account/keys");
        return Response.json({ data: [] });
    });

    await listKeys({}, CONTEXT);
});

test("createKey posts name, type and mapped options to /account/keys", async (t) => {
    const calls = withFetch(t, (url, init) => {
        assert.equal(url.pathname, "/account/keys");
        assert.equal(init.method, "POST");
        const body = JSON.parse(init.body);
        assert.deepEqual(body, {
            name: "my-bot",
            type: "secret",
            expiresIn: 3600,
            allowedModels: ["flux"],
            pollenBudget: 5,
            accountPermissions: ["usage"],
        });
        return Response.json({ id: "k1", key: "sk_new", name: "my-bot" });
    });

    await createKey(
        {
            name: "my-bot",
            type: "secret",
            expiresIn: 3600,
            models: ["flux"],
            budget: 5,
            permissions: ["usage"],
        },
        CONTEXT,
    );

    assert.equal(calls.length, 1);
});

test("revokeKey sends DELETE to /account/keys/:id", async (t) => {
    const calls = withFetch(t, (url, init) => {
        assert.equal(url.pathname, "/account/keys/key123");
        assert.equal(init.method, "DELETE");
        return Response.json({ success: true });
    });

    const result = await revokeKey({ id: "key123" }, CONTEXT);
    assert.deepEqual(JSON.parse(result.content[0].text), { success: true });
    assert.equal(calls.length, 1);
});
