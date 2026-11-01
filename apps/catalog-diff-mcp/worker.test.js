import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const BASE = "https://catalog-diff-mcp.pollinations.ai";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "catalog-diff-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(BASE), {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
    );
    return client;
}

const MODELS = [
    {
        id: "alpha",
        title: "Alpha",
        aliases: ["a", "b"],
        pricing: { prompt: 1 },
        health: { ok: true },
        tags: ["x"],
    },
    { id: "beta", title: "Beta", aliases: [] },
];

// Mock the live catalog and call a tool through the real MCP transport.
async function callTool(t, name, args, catalog = { data: MODELS }) {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), "https://gen.pollinations.ai/v1/models");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return catalog instanceof Response ? catalog : Response.json(catalog);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    return client.callTool({ name, arguments: args });
}

const body = (result) => JSON.parse(result.content[0].text);

test("serves health, requires bearer auth, rejects batches", async () => {
    const health = await worker.fetch(new Request(`${BASE}/health`));
    assert.equal(health.status, 200);

    const unauthorized = await worker.fetch(
        new Request(BASE, { method: "POST", body: "{}" }),
    );
    assert.equal(unauthorized.status, 401);

    const batch = await worker.fetch(
        new Request(BASE, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
        }),
    );
    assert.equal(batch.status, 400);
});

test("get_catalog returns stable fields only; its output is a valid baseline", async (t) => {
    const snapshot = body(await callTool(t, "get_catalog", {}));
    assert.deepEqual(
        snapshot.models.map((model) => model.id),
        ["alpha", "beta"],
    );
    assert.equal("health" in snapshot.models[0], false);
    assert.equal("tags" in snapshot.models[0], false);

    // Reordered arrays and a changed `health` are not changes.
    const live = MODELS.map((model) => ({
        ...model,
        aliases: [...model.aliases].reverse(),
        health: { ok: false },
    }));
    const result = body(
        await callTool(
            t,
            "diff_catalog",
            { baseline: snapshot },
            { data: live },
        ),
    );
    assert.deepEqual(result, { added: [], removed: [], changed: [] });
});

test("diff_catalog reports added, removed and changed models", async (t) => {
    const baseline = { models: MODELS };
    const live = [
        {
            id: "alpha",
            title: "Alpha 2",
            aliases: ["a", "b"],
            pricing: { prompt: 1 },
        },
        { id: "gamma", title: "Gamma" },
    ];
    const result = body(
        await callTool(t, "diff_catalog", { baseline }, { data: live }),
    );
    assert.deepEqual(result.added, ["gamma"]);
    assert.deepEqual(result.removed, ["beta"]);
    assert.deepEqual(result.changed, [
        {
            id: "alpha",
            changes: [
                { field: "title", baseline: "Alpha", current: "Alpha 2" },
            ],
        },
    ]);
});

test("a bad live catalog fails instead of faking removals", async (t) => {
    const baseline = { models: MODELS };
    for (const catalog of [
        { data: [] },
        { data: "nope" },
        { data: [MODELS[0], { title: "no id" }] },
        { data: [MODELS[0], MODELS[0]] },
        new Response("down", { status: 503 }),
    ]) {
        const result = await callTool(t, "diff_catalog", { baseline }, catalog);
        assert.equal(result.isError, true);
        assert.equal(globalThis.fetch.mock.callCount(), 1);
        t.mock.restoreAll();
    }
});

test("only string arrays compare as sets; other arrays keep their order", async (t) => {
    const baseline = {
        models: [
            {
                id: "a",
                aliases: ["x"],
                values: [1, 2],
                items: [{ toString: "p" }, { toString: "q" }],
            },
        ],
    };
    const live = [
        {
            id: "a",
            aliases: ["x", "x"],
            values: [2, 1],
            items: [{ toString: "p" }, { toString: "q" }],
        },
    ];
    const result = body(
        await callTool(t, "diff_catalog", { baseline }, { data: live }),
    );
    assert.deepEqual(
        result.changed.map(({ changes }) => changes.map(({ field }) => field)),
        [["values"]],
    );
});

test("an unusable baseline is rejected before any fetch", async (t) => {
    const result = await callTool(t, "diff_catalog", {
        baseline: { models: [] },
    });
    assert.equal(result.isError, true);
    assert.equal(globalThis.fetch.mock.callCount(), 0);
});
