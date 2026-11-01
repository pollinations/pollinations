import assert from "node:assert/strict";
import test from "node:test";
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
        {
            daily: true,
            days: 14,
            limit: 5,
            model: ["openai"],
            key: ["k1", "k2"],
        },
        "GET",
        "/account/usage/daily?days=14&api_key_ids=k1%2Ck2",
    ],
    ["getEarnings", { days: 30 }, "GET", "/account/earnings?days=30"],
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
    ["listSites", {}, "GET", "/account/sites"],
    [
        "deploySite",
        {
            name: "my-app",
            files: [{ file: "index.html", data: "<h1>Hi</h1>" }],
        },
        "PUT",
        "/account/sites/my-app",
        { files: [{ file: "index.html", data: "<h1>Hi</h1>" }] },
    ],
    ["deleteSite", { name: "my-app" }, "DELETE", "/account/sites/my-app"],
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

        const result = await tools[name].handler(args, CONTEXT);

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

test("getBalance preserves the paid balance needed to assess paid-only models", async (t) => {
    // Paid-only models spend paid Pollen, not the total; pass through the
    // gateway's breakdown while preserving the existing pollen and note fields.
    mockFetch(t, () =>
        Response.json({
            balance: 12,
            accountBalance: { total: 12, tier: 12, paid: 0 },
        }),
    );

    const result = await tools.getBalance.handler({}, CONTEXT);
    const balance = JSON.parse(result.content[0].text);

    assert.equal(balance.pollen, 12);
    assert.deepEqual(balance.accountBalance, { total: 12, tier: 12, paid: 0 });
    assert.equal(balance.accountBalance.paid, 0);
    assert.equal(
        balance.note,
        "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
    );
});

test("getBalance omits accountBalance when the gateway omits it", async (t) => {
    mockFetch(t, () => Response.json({ balance: 5 }));

    const result = await tools.getBalance.handler({}, CONTEXT);
    const balance = JSON.parse(result.content[0].text);

    assert.equal(balance.pollen, 5);
    assert.equal("accountBalance" in balance, false);
});

test("getUsage lists 20 requests unless told otherwise", () => {
    assert.equal(tools.getUsage.shape.limit.parse(undefined), 20);
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
