import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { accountTools } from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const tools = Object.fromEntries(
    accountTools.map(([name, , shape, handler]) => [name, { shape, handler }]),
);

// Each tool call must become exactly this request against the account API.
const REQUESTS = [
    ["getUsage", {}, "GET", "/account/usage"],
    [
        "getUsage",
        { days: 7, limit: 5, model: ["openai", "flux"], key: ["k1", "k2"] },
        "GET",
        "/account/usage?days=7&limit=5&models=openai%2Cflux&api_key_ids=k1%2Ck2",
    ],
    [
        "getUsage",
        { daily: true, days: 14, limit: 5, model: ["openai"] },
        "GET",
        "/account/usage/daily?days=14",
    ],
    ["getEarnings", { days: 30 }, "GET", "/account/earnings?days=30"],
    ["getEarnings", { days: 180 }, "GET", "/account/earnings?days=180"],
    ["getEarnings", { days: 365 }, "GET", "/account/earnings?days=365"],
    ["listQuests", {}, "GET", "/account/quests"],
    ["listKeys", {}, "GET", "/account/keys"],
    [
        "createKey",
        {
            name: "bot",
            type: "publishable",
            expiresIn: 3600,
            models: ["openai"],
            budget: 0,
            permissions: ["usage"],
            redirectUri: ["https://example.com/cb"],
            earnings: true,
        },
        "POST",
        "/account/keys",
        {
            name: "bot",
            type: "publishable",
            expiresIn: 3600,
            allowedModels: ["openai"],
            pollenBudget: 0,
            accountPermissions: ["usage"],
            redirectUris: ["https://example.com/cb"],
            earningsEnabled: true,
        },
    ],
    ["createKey", { name: "bot" }, "POST", "/account/keys", { name: "bot" }],
    ["revokeKey", { id: "abc123" }, "DELETE", "/account/keys/abc123"],
];

function mockFetch(t, respond) {
    const original = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = original;
    });
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: new URL(String(input)), init });
        return respond();
    };
    return calls;
}

for (const [name, args, method, path, body] of REQUESTS) {
    test(`${name} ${JSON.stringify(args)} calls ${method} ${path}`, async (t) => {
        const calls = mockFetch(t, () => Response.json({ ok: true }));

        const params =
            name === "getEarnings"
                ? z.object(tools[name].shape).parse(args)
                : args;
        const result = await tools[name].handler(params, CONTEXT);

        assert.equal(calls.length, 1);
        const [call] = calls;
        assert.equal(call.init.method, method);
        assert.equal(call.url.pathname + call.url.search, path);
        assert.equal(call.init.headers.Authorization, "Bearer sk_test");
        assert.deepEqual(
            call.init.body ? JSON.parse(call.init.body) : undefined,
            body,
        );
        assert.deepEqual(JSON.parse(result.content[0].text), { ok: true });
    });
}

test("getUsage lists 20 requests unless told otherwise", () => {
    assert.equal(tools.getUsage.shape.limit.parse(undefined), 20);
});

test("earnings accepts up to 365 days while usage remains limited to 90", () => {
    const earnings = z.object(tools.getEarnings.shape);
    const usage = z.object(tools.getUsage.shape);
    assert.deepEqual(earnings.parse({}), {});
    for (const days of [1, 90, 91, 180, 365]) {
        assert.equal(earnings.parse({ days }).days, days);
    }
    for (const days of [0, 1.5, 366]) {
        assert.equal(earnings.safeParse({ days }).success, false);
    }
    assert.equal(usage.parse({ days: 90 }).days, 90);
    assert.equal(usage.safeParse({ days: 91 }).success, false);
});

test("returns the API's own error message on a missing permission", async (t) => {
    mockFetch(t, () =>
        Response.json(
            { error: { message: "API key missing 'account:keys' permission" } },
            { status: 403 },
        ),
    );

    await assert.rejects(
        tools.listKeys.handler({}, CONTEXT),
        /API key missing 'account:keys' permission/,
    );
});

test("requires an API key before calling the API", async (t) => {
    const calls = mockFetch(t, () => Response.json({}));

    for (const { handler } of Object.values(tools)) {
        await assert.rejects(
            handler({ name: "x", id: "x" }, {}),
            /API key required/,
        );
    }
    assert.equal(calls.length, 0);
});
