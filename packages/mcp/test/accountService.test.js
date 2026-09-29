import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

const handlers = Object.fromEntries(
    accountTools.map(([name, , , handler]) => [name, handler]),
);

// Stubs globalThis.fetch for one test; `respond` maps url -> Response.
function stubFetch(t, respond) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        return respond(url, init);
    };
    return calls;
}

const jsonText = (result) => JSON.parse(result.content[0].text);

test("getUsage requests per-request history with CLI flag defaults", async (t) => {
    const calls = stubFetch(t, (url, init) => {
        assert.equal(init.headers.Authorization, "Bearer sk_test");
        assert.ok(url.startsWith("https://gen.pollinations.ai/account/usage?"));
        const query = new URL(url).searchParams;
        assert.equal(query.get("limit"), "20");
        assert.equal(query.get("days"), "14");
        assert.equal(query.get("models"), "openai,kimi");
        assert.equal(
            query.get("api_key_ids"),
            "aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
        );
        return Response.json({ usage: [] });
    });

    const result = await handlers.getUsage(
        {
            days: 14,
            models: ["openai", "kimi"],
            keys: ["aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK"],
        },
        CONTEXT,
    );
    assert.deepEqual(jsonText(result), { usage: [] });
    assert.equal(calls.length, 1);
});

test("getUsage resolves key names via /account/keys", async (t) => {
    const calls = stubFetch(t, (url) => {
        if (url.endsWith("/account/keys")) {
            return Response.json({
                data: [
                    { id: "11111111-2222-3333-4444-555555555555", name: "bot" },
                ],
            });
        }
        assert.equal(
            new URL(url).searchParams.get("api_key_ids"),
            "aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK,11111111-2222-3333-4444-555555555555",
        );
        return Response.json({ usage: [] });
    });

    await handlers.getUsage(
        { keys: ["aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK", "bot"] },
        CONTEXT,
    );
    assert.equal(calls.length, 2);
});

test("getUsage daily hits the daily endpoint without history filters", async (t) => {
    stubFetch(t, (url) => {
        assert.ok(
            url.startsWith("https://gen.pollinations.ai/account/usage/daily?"),
        );
        const query = new URL(url).searchParams;
        assert.equal(query.get("days"), "7");
        assert.equal(query.get("api_key_ids"), null);
        assert.equal(query.get("models"), null);
        return Response.json({ usage: [{ date: "2026-09-28" }] });
    });

    const result = await handlers.getUsage(
        { daily: true, days: 7, models: ["openai"], keys: ["bot"] },
        CONTEXT,
    );
    assert.deepEqual(jsonText(result), { usage: [{ date: "2026-09-28" }] });
});

test("getUsage rejects an unknown key name before the usage call", async (t) => {
    const calls = stubFetch(t, () =>
        Response.json({ data: [{ id: "x", name: "other" }] }),
    );
    await assert.rejects(
        handlers.getUsage({ keys: ["bot"] }, CONTEXT),
        /No API key named "bot"/,
    );
    assert.equal(calls.length, 1); // only the /account/keys lookup
});

test("getEarnings passes the days window, defaulting to 30", async (t) => {
    stubFetch(t, (url) => {
        assert.ok(
            url.startsWith(
                "https://gen.pollinations.ai/account/earnings?days=30",
            ),
        );
        return Response.json({ daily: [], perEntity: [] });
    });
    await handlers.getEarnings({}, CONTEXT);
});

test("listQuests and listKeys call their account routes", async (t) => {
    const seen = [];
    stubFetch(t, (url) => {
        seen.push(new URL(url).pathname);
        return Response.json({ data: [] });
    });
    await handlers.listQuests({}, CONTEXT);
    await handlers.listKeys({}, CONTEXT);
    assert.deepEqual(seen, ["/account/quests", "/account/keys"]);
});

test("createKey posts the CLI flag body mapping", async (t) => {
    stubFetch(t, (url, init) => {
        assert.equal(url, "https://gen.pollinations.ai/account/keys");
        assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(init.body), {
            name: "my-bot",
            type: "secret",
            expiresIn: 3600,
            allowedModels: ["openai"],
            pollenBudget: 5,
            accountPermissions: ["usage"],
        });
        return Response.json({ id: "k1", key: "sk_new" });
    });

    const result = await handlers.createKey(
        {
            name: "my-bot",
            type: "secret",
            expiresIn: 3600,
            models: ["openai"],
            budget: 5,
            permissions: ["usage"],
        },
        CONTEXT,
    );
    assert.deepEqual(jsonText(result), { id: "k1", key: "sk_new" });
});

test("createKey rejects publishable-only options on secret keys", async (t) => {
    stubFetch(t, () => {
        throw new Error("fetch must not be called");
    });
    await assert.rejects(
        handlers.createKey(
            { name: "app", redirectUris: ["https://app.example/cb"] },
            CONTEXT,
        ),
        /redirectUris requires type 'publishable'/,
    );
    await assert.rejects(
        handlers.createKey({ name: "app", earnings: true }, CONTEXT),
        /earnings requires type 'publishable'/,
    );
});

test("revokeKey deletes the key id", async (t) => {
    stubFetch(t, (url, init) => {
        assert.equal(url, "https://gen.pollinations.ai/account/keys/k1%2Fx");
        assert.equal(init.method, "DELETE");
        return Response.json({ success: true });
    });
    const result = await handlers.revokeKey({ id: "k1/x" }, CONTEXT);
    assert.deepEqual(jsonText(result), { success: true });
});

test("every tool requires an API key", async () => {
    for (const [name, handler] of Object.entries({
        getUsage: handlers.getUsage,
        getEarnings: handlers.getEarnings,
        listQuests: handlers.listQuests,
        listKeys: handlers.listKeys,
        createKey: handlers.createKey,
        revokeKey: handlers.revokeKey,
    })) {
        await assert.rejects(
            handler({}, {}),
            /API key required/,
            `${name} must require an API key`,
        );
    }
});
