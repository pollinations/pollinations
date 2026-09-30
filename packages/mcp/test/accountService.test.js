import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

function tool(name) {
    const entry = accountTools.find(([toolName]) => toolName === name);
    assert.ok(entry, `tool ${name} is missing`);
    return { description: entry[1], schema: entry[2], handler: entry[3] };
}

/** Run a handler with fetch stubbed; return the single captured call. */
async function call(name, params, respond) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        return respond(url, init);
    };
    try {
        const result = await tool(name).handler(params, CONTEXT);
        return { result, calls };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

const json = (body) => Response.json(body);

test("accountTools keeps the [name, description, schema, handler] shape", () => {
    const names = accountTools.map(([name]) => name);
    assert.deepEqual(names, [
        "getBalance",
        "getUsage",
        "getEarnings",
        "listQuests",
        "listKeys",
        "createKey",
        "revokeKey",
    ]);
    for (const [, description, schema, handler] of accountTools) {
        assert.equal(typeof description, "string");
        assert.equal(typeof schema, "object");
        assert.equal(typeof handler, "function");
    }
});

test("getUsage fetches per-request history with the bearer token", async () => {
    const body = { usage: [{ model: "openai/gpt-5.4-nano" }], count: 1 };
    const { result, calls } = await call("getUsage", {}, () => json(body));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gen.pollinations.ai/account/usage");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(JSON.parse(result.content[0].text), body);
});

test("getUsage daily hits /account/usage/daily and forwards filters", async () => {
    const { calls } = await call(
        "getUsage",
        { daily: true, days: 7, models: ["a", "b"], keyIds: ["k1"] },
        () => json({ usage: [], count: 0 }),
    );
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/account/usage/daily");
    assert.equal(url.searchParams.get("days"), "7");
    assert.equal(url.searchParams.get("models"), "a,b");
    assert.equal(url.searchParams.get("api_key_ids"), "k1");
});

test("getEarnings passes the window and parses the response", async () => {
    const body = { daily: [], perEntity: [] };
    const { result, calls } = await call("getEarnings", { days: 90 }, () =>
        json(body),
    );
    assert.equal(
        calls[0].url,
        "https://gen.pollinations.ai/account/earnings?days=90",
    );
    assert.deepEqual(JSON.parse(result.content[0].text), body);
});

test("listQuests and listKeys GET the account endpoints", async () => {
    const quests = await call("listQuests", {}, () => json({ quests: [] }));
    assert.equal(
        quests.calls[0].url,
        "https://gen.pollinations.ai/account/quests",
    );
    const keys = await call("listKeys", {}, () => json({ data: [] }));
    assert.equal(keys.calls[0].url, "https://gen.pollinations.ai/account/keys");
});

test("createKey POSTs the body it was given and drops unset fields", async () => {
    const { result, calls } = await call(
        "createKey",
        { name: "my-bot", type: "secret", budget: 5 },
        () => json({ id: "x", key: "sk_new" }),
    );
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        name: "my-bot",
        type: "secret",
        pollenBudget: 5,
    });
    assert.equal(JSON.parse(result.content[0].text).key, "sk_new");
});

test("revokeKey DELETEs the key by id", async () => {
    const { calls } = await call("revokeKey", { id: "abc123" }, () =>
        json({ success: true }),
    );
    assert.equal(calls[0].init.method, "DELETE");
    assert.equal(
        calls[0].url,
        "https://gen.pollinations.ai/account/keys/abc123",
    );
});

test("every tool requires an API key", async () => {
    for (const [name, , , handler] of accountTools) {
        await assert.rejects(
            () => handler({}, {}),
            /API key required/,
            `${name} should require an API key`,
        );
    }
});

test("the API error message is surfaced", async () => {
    await assert.rejects(
        () =>
            call("getUsage", {}, () =>
                Response.json(
                    { error: { message: "needs account:usage" } },
                    { status: 403 },
                ),
            ),
        /needs account:usage/,
    );
});
