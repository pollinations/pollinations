import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { planImageBudget } from "./budget.js";
import worker from "./worker.js";

const model = (name, price, extra = {}) => ({
    name,
    category: "image",
    flat_rate: true,
    pricing: { currency: "pollen", completionImageTokens: price },
    ...extra,
});
const params = { images: 3, budget: 0.3, questOnly: false, limit: 10 };

async function connect(token = "sk_test_not_a_real_key", modern = false) {
    const client = new Client(
        { name: "image-budget-test", version: "0.1.0" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://image-budget-mcp.pollinations.ai"),
            {
                fetch: (input, init) => worker.fetch(new Request(input, init)),
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

test("exact decimal boundaries, zero prices, sorting and output limits", () => {
    const result = planImageBudget(
        [
            model("expensive", "0.100000000001"),
            model("exact", "0.1"),
            model("free", "0"),
            model("cheap", "0.01"),
        ],
        params,
    );
    assert.deepEqual(
        result.candidates.map((m) => m.model),
        ["free", "cheap", "exact", "expensive"],
    );
    assert.equal(result.candidates[2].totalCost, "0.3");
    assert.equal(result.candidates[2].withinBudget, true);
    assert.equal(result.candidates[2].maxImages, "3");
    assert.equal(result.candidates[3].withinBudget, false);
    assert.equal(result.candidates[3].maxImages, "2");
    assert.equal(result.candidates[0].maxImages, null);
    assert.equal(result.candidates[0].free, true);
    assert.equal(
        planImageBudget([model("tiny", "0.000000000001")], {
            ...params,
            budget: 1000000,
        }).candidates[0].maxImages,
        "1000000000000000000",
    );
    assert.equal(
        planImageBudget([model("a", "1"), model("b", "2")], {
            ...params,
            limit: 1,
        }).candidates.length,
        1,
    );
});

test("never quotes token, megapixel, variant, missing, malformed or agent prices as flat/free", () => {
    const unsupported = [
        model("token", "0.001", { flat_rate: false }),
        model("megapixel", "0.01", {
            pricing_units: { completionImageTokens: { unit: "megapixel" } },
        }),
        model("variant", "0.01", { pricing_variants: [{ name: "2k" }] }),
        model("adjustment", "0.01", {
            pricing_adjustments: [{ price: "0.1" }],
        }),
        model("missing", undefined),
        model("invalid", "NaN"),
        model("negative", "-1"),
        model("tooPrecise", "0.0000000000001"),
        model("agent", "0.01", { agent: true }),
        model("unknown", "0.01", { flat_rate: undefined }),
        model("mixed", "0.01", {
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.01",
                promptTextTokens: "0.000001",
            },
        }),
    ];
    const result = planImageBudget(unsupported, params);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.excluded.length, unsupported.length);
    assert.deepEqual(
        planImageBudget([model("paid", "0.01", { paid_only: true })], {
            ...params,
            questOnly: true,
        }).candidates,
        [],
    );
});

test("health, authentication and JSON-RPC batch boundaries", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://local/health"))).status,
        200,
    );
    assert.equal(
        (await worker.fetch(new Request("https://local/mcp"))).status,
        404,
    );
    for (const authorization of [
        "",
        "Basic nope",
        "Bearer",
        "Bearer token extra",
    ]) {
        assert.equal(
            (
                await worker.fetch(
                    new Request("https://local/", {
                        headers: { authorization },
                    }),
                )
            ).status,
            401,
        );
    }
    assert.equal(
        (
            await worker.fetch(
                new Request("https://local/", {
                    method: "POST",
                    headers: { Authorization: "Bearer test" },
                    body: "[]",
                }),
            )
        ).status,
        400,
    );
});

test("modern and legacy clients discover one read-only tool without sessions", async () => {
    for (const modern of [false, true]) {
        const client = await connect(undefined, modern);
        try {
            const { tools } = await client.listTools();
            assert.deepEqual(
                tools.map((t) => t.name),
                ["image_budget"],
            );
            assert.equal(tools[0].annotations.readOnlyHint, true);
        } finally {
            await client.close();
        }
    }
});

test("requests only the catalog with each caller's key and propagates catalog failures", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(
            url.origin + url.pathname,
            "https://gen.pollinations.ai/image/models",
        );
        assert.equal(url.searchParams.get("agent"), "false");
        assert.equal(url.searchParams.get("community"), "false");
        assert.equal(url.searchParams.get("query"), "example");
        seen.push(new Headers(init.headers).get("authorization"));
        return Response.json([model("example", "0.1")]);
    });
    for (const token of ["sk_test_alice", "sk_test_bob"]) {
        const client = await connect(token);
        try {
            const result = await client.callTool({
                name: "image_budget",
                arguments: { images: 3, budget: 0.3, query: "example" },
            });
            assert.notEqual(result.isError, true);
            assert.equal(
                JSON.parse(result.content[0].text).candidates[0].totalCost,
                "0.3",
            );
        } finally {
            await client.close();
        }
    }
    assert.deepEqual(seen, ["Bearer sk_test_alice", "Bearer sk_test_bob"]);
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("unavailable", { status: 503 }),
    );
    const client = await connect();
    try {
        const result = await client.callTool({
            name: "image_budget",
            arguments: { images: 1, budget: 1 },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /503/);
    } finally {
        await client.close();
    }
});

test("rejects invalid inputs before any catalog request", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return Response.json([]);
    });
    const client = await connect();
    try {
        for (const invalid of [
            { images: 0 },
            { images: 1.5 },
            { images: 1000001 },
            { budget: -1 },
            { budget: 0.0000000000001 },
            { limit: 51 },
        ]) {
            const result = await client.callTool({
                name: "image_budget",
                arguments: { images: 1, budget: 1, ...invalid },
            });
            assert.equal(result.isError, true);
        }
        assert.equal(calls, 0);
    } finally {
        await client.close();
    }
});
