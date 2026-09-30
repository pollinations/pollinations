import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";

const TOKEN = "sk_test_request_scoped";
const CONTEXT = { http: { authInfo: { token: TOKEN } } };
const tools = Object.fromEntries(accountTools.map((t) => [t[0], t]));

const textOf = (result) => JSON.parse(result.content[0].text);

function mockFetch(handler) {
    const seen = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        const method = init.method || "GET";
        const authorization = new Headers(init.headers).get("authorization");
        seen.push({ url, method, authorization, body: init.body });
        return handler(url, method, init);
    };
    return {
        seen,
        restore() {
            globalThis.fetch = original;
        },
    };
}

test("getBalance requests the account balance", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/balance$/);
        return Response.json({ pollen: 42 });
    });
    try {
        const result = await tools.getBalance[3]({}, CONTEXT);
        assert.equal(textOf(result).pollen, 42);
    } finally {
        mock.restore();
    }
});

test("getUsage builds the history request with filters", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/usage\?days=7&limit=5&models=a%2Cb&api_key_ids=k1%2Ck2$/);
        return Response.json({ usage: [{ timestamp: "t" }], count: 1 });
    });
    try {
        const result = await tools.getUsage[3](
            { days: 7, limit: 5, models: ["a", "b"], apiKeyIds: ["k1", "k2"] },
            CONTEXT,
        );
        assert.equal(textOf(result).count, 1);
        assert.equal(mock.seen[0].method, "GET");
        assert.equal(mock.seen[0].authorization, `Bearer ${TOKEN}`);
    } finally {
        mock.restore();
    }
});

test("getUsage switches to the daily endpoint", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/usage\/daily\?days=7$/);
        return Response.json({
            usage: [{ date: "2026-09-30", requests: 12 }],
            count: 1,
        });
    });
    try {
        const result = await tools.getUsage[3](
            { days: 7, daily: true },
            CONTEXT,
        );
        assert.equal(textOf(result).usage[0].requests, 12);
    } finally {
        mock.restore();
    }
});

test("getEarnings requests the rolling window", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/earnings\?days=30$/);
        return Response.json({ daily: [], perEntity: [] });
    });
    try {
        const result = await tools.getEarnings[3](
            { days: 30 },
            CONTEXT,
        );
        assert.deepEqual(textOf(result).perEntity, []);
    } finally {
        mock.restore();
    }
});

test("listQuests requests the quest catalog", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/quests$/);
        return Response.json({ quests: [{ id: "q1", title: "Quest 1" }] });
    });
    try {
        const result = await tools.listQuests[3]({}, CONTEXT);
        assert.equal(textOf(result).quests[0].title, "Quest 1");
    } finally {
        mock.restore();
    }
});

test("listKeys requests the key list", async () => {
    const mock = mockFetch((url) => {
        assert.match(url, /\/account\/keys$/);
        return Response.json({ data: [{ id: "k1", name: "test" }] });
    });
    try {
        const result = await tools.listKeys[3]({}, CONTEXT);
        assert.equal(textOf(result).data[0].name, "test");
    } finally {
        mock.restore();
    }
});

test("createKey posts the key body and returns the created key", async () => {
    const mock = mockFetch((url, method, init) => {
        assert.equal(method, "POST");
        assert.match(url, /\/account\/keys$/);
        assert.deepEqual(JSON.parse(init.body), {
            name: "my-app",
            type: "publishable",
            allowedModels: ["openai"],
            pollenBudget: 10,
            accountPermissions: ["usage", "keys"],
            redirectUris: ["https://myapp.com/callback"],
            earningsEnabled: true,
        });
        return Response.json({
            id: "k1",
            key: "pk_test_created",
            name: "my-app",
        });
    });
    try {
        const result = await tools.createKey[3](
            {
                name: "my-app",
                type: "publishable",
                allowedModels: ["openai"],
                pollenBudget: 10,
                accountPermissions: ["usage", "keys"],
                redirectUris: ["https://myapp.com/callback"],
                earningsEnabled: true,
            },
            CONTEXT,
        );
        assert.equal(textOf(result).key, "pk_test_created");
    } finally {
        mock.restore();
    }
});

test("revokeKey deletes the key by id", async () => {
    const mock = mockFetch((url, method) => {
        assert.equal(method, "DELETE");
        assert.match(url, /\/account\/keys\/k1$/);
        return Response.json({ success: true });
    });
    try {
        const result = await tools.revokeKey[3]({ id: "k1" }, CONTEXT);
        assert.equal(textOf(result).success, true);
    } finally {
        mock.restore();
    }
});

test("account tools require a bearer token", async () => {
    await assert.rejects(
        () => tools.getUsage[3]({}, { http: { authInfo: {} } }),
        /API key required/,
    );
    await assert.rejects(
        () => tools.createKey[3]({ name: "x" }, { http: { authInfo: {} } }),
        /API key required/,
    );
});
