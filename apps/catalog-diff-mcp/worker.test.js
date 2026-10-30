import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, {
    COMPARABLE_FIELDS,
    diffSnapshots,
    normalizeCatalog,
    normalizeModel,
    resolveDiffFields,
    snapshotId,
    stableStringify,
    validateBaseline,
} from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["diff_catalog", "get_catalog"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "catalog-diff-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://catalog-diff-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

async function withClient(fn, options) {
    const client = await connectClient(
        options ?? { versionNegotiation: { mode: "auto" } },
    );
    try {
        await fn(client);
    } finally {
        await client.close();
    }
}
function toolText(result) {
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
}

// Concrete input/output fixture: one addition, one removal, one field change.
const BASELINE_SNAPSHOT = {
    snapshot_id: "baseline-snap-001",
    source: "https://gen.pollinations.ai/v1/models",
    observed_at: "2026-10-10T00:00:00.000Z",
    model_count: 3,
    models: [
        {
            id: "openai/gpt-x",
            title: "GPT X",
            description: "Old description",
            owned_by: "openai",
            aliases: ["gpt-x", "openai/gpt-x-alias"],
            category: "text",
            community: false,
            paid_only: false,
            pricing: { prompt: 1, completion: 2 },
            capabilities: ["chat"],
            supported_endpoints: ["/v1/responses", "/v1/chat/completions"],
            input_modalities: ["text"],
            output_modalities: ["text"],
            created: 1000,
        },
        {
            id: "gone/model",
            title: "Gone Model",
            description: "Removed upstream",
            owned_by: "gone",
            aliases: [],
            category: "image",
            community: false,
            paid_only: false,
            supported_endpoints: ["/v1/images/generations"],
            created: 900,
        },
        {
            id: "steady/model",
            title: "Steady",
            description: "Unchanged",
            owned_by: "steady",
            aliases: [],
            category: "text",
            community: false,
            paid_only: false,
            supported_endpoints: ["/v1/chat/completions"],
            created: 800,
        },
    ],
};

const FRESH_RAW = {
    object: "list",
    data: [
        {
            id: "steady/model",
            title: "Steady",
            description: "Unchanged",
            owned_by: "steady",
            aliases: [],
            category: "text",
            community: false,
            paid_only: false,
            supported_endpoints: ["/v1/chat/completions"],
            created: 800,
            // Volatile operational field: must be ignored by normalization/diff.
            health: { status: "ok", success_rate: 0.99, requests: 50 },
            // Derived display field: must be ignored by normalization/diff.
            tags: [{ name: "text" }],
        },
        {
            // Note: deliberately unsorted aliases + endpoints to test normalization.
            id: "openai/gpt-x",
            title: "GPT X",
            description: "New description",
            owned_by: "openai",
            aliases: ["openai/gpt-x-alias", "gpt-x"],
            category: "text",
            community: false,
            paid_only: false,
            pricing: { prompt: 1, completion: 3 },
            capabilities: ["chat"],
            supported_endpoints: ["/v1/chat/completions", "/v1/responses"],
            input_modalities: ["text"],
            output_modalities: ["text"],
            created: 1000,
        },
        {
            id: "brand/model-new",
            title: "Brand New",
            description: "Added upstream",
            owned_by: "brand",
            aliases: [],
            category: "audio",
            community: true,
            paid_only: false,
            supported_endpoints: ["/v1/audio/speech"],
            created: 1100,
        },
        // No string id: must be skipped, never diffed.
        { title: "Nameless" },
    ],
};

function mockCatalogFetch(t, raw = FRESH_RAW, seen = null) {
    return t.mock.method(globalThis, "fetch", async (input, init) => {
        if (seen) {
            seen.push({
                url: String(input),
                authorization: new Headers(init.headers).get("authorization"),
            });
        }
        return Response.json(raw);
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://catalog-diff-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.endpoint, "/");
    assert.equal(body.stateless, true);

    const unauthorized = await worker.fetch(
        new Request("https://catalog-diff-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="catalog-diff-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://catalog-diff-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://catalog-diff-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

test("discovers get_catalog and diff_catalog", async () => {
    await withClient(async (client) => {
        const tools = (await client.listTools()).tools
            .map(({ name }) => name)
            .sort();
        assert.deepEqual(tools, EXPECTED_TOOLS);
    });
});

test("get_catalog returns a normalized snapshot with provenance", async (t) => {
    const seen = [];
    mockCatalogFetch(t, FRESH_RAW, seen);
    await withClient(async (client) => {
        const result = await client.callTool({
            name: "get_catalog",
            arguments: {},
        });
        assert.notEqual(result.isError, true);
        const snapshot = toolText(result);
        assert.match(snapshot.snapshot_id, /^[0-9a-f]{64}$/);
        assert.equal(snapshot.source, "https://gen.pollinations.ai/v1/models");
        assert.ok(!Number.isNaN(Date.parse(snapshot.observed_at)));
        assert.equal(snapshot.model_count, 3);
        assert.deepEqual(
            snapshot.models.map((m) => m.id),
            ["brand/model-new", "openai/gpt-x", "steady/model"],
        );
        const gptx = snapshot.models.find((m) => m.id === "openai/gpt-x");
        assert.deepEqual(gptx.aliases, ["gpt-x", "openai/gpt-x-alias"]);
        assert.deepEqual(gptx.supported_endpoints, [
            "/v1/chat/completions",
            "/v1/responses",
        ]);
        assert.equal(gptx.health, undefined);
        assert.equal(gptx.tags, undefined);
        assert.equal(snapshot.skipped_invalid_entries, 1);
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://gen.pollinations.ai/v1/models");
    assert.equal(seen[0].authorization, `Bearer ${TOKEN}`);
});

test("get_catalog surfaces upstream errors without a snapshot", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: { message: "boom" } }, { status: 500 }),
    );
    await withClient(async (client) => {
        const result = await client.callTool({
            name: "get_catalog",
            arguments: {},
        });
        assert.equal(result.isError, true);
        assert.equal(toolText(result).status, "fetch_failed");
    });
});

test("get_catalog rejects non-list and empty payloads", async (t) => {
    const raws = [{}, { object: "list", data: [] }, { object: "list" }];
    let call = 0;
    t.mock.method(globalThis, "fetch", async () => Response.json(raws[call++]));
    await withClient(async (client) => {
        for (let i = 0; i < raws.length; i++) {
            const result = await client.callTool({
                name: "get_catalog",
                arguments: {},
            });
            assert.equal(result.isError, true);
            assert.match(
                toolText(result).status,
                /^(invalid_catalog|catalog_empty)$/,
            );
        }
    });
});

test("diff_catalog reports an addition, a removal, and field changes", async (t) => {
    mockCatalogFetch(t);
    await withClient(async (client) => {
        const result = await client.callTool({
            name: "diff_catalog",
            arguments: { baseline: BASELINE_SNAPSHOT },
        });
        assert.notEqual(result.isError, true);
        const diff = toolText(result);
        assert.equal(diff.status, "ok");
        assert.equal(diff.history_unavailable, false);
        assert.deepEqual(diff.counts, { added: 1, removed: 1, changed: 1 });
        assert.deepEqual(
            diff.added.map((m) => m.id),
            ["brand/model-new"],
        );
        assert.deepEqual(
            diff.removed.map((m) => m.id),
            ["gone/model"],
        );
        assert.equal(diff.changed.length, 1);
        assert.equal(diff.changed[0].id, "openai/gpt-x");
        // COMPARABLE_FIELDS order: description before pricing.
        assert.deepEqual(
            diff.changed[0].changes.map((c) => c.field),
            ["description", "pricing"],
        );
        assert.deepEqual(
            diff.changed[0].changes.find((c) => c.field === "description"),
            {
                field: "description",
                baseline: "Old description",
                current: "New description",
            },
        );
        assert.deepEqual(
            diff.changed[0].changes.find((c) => c.field === "pricing"),
            {
                field: "pricing",
                baseline: { prompt: 1, completion: 2 },
                current: { prompt: 1, completion: 3 },
            },
        );
        assert.equal(diff.baseline.snapshot_id, "baseline-snap-001");
        assert.match(diff.current.snapshot_id, /^[0-9a-f]{64}$/);
    });
});

test("diff_catalog returns history_unavailable for unusable baselines", async (t) => {
    mockCatalogFetch(t);
    const bad = [
        null,
        "2026-10-10",
        {},
        { ...BASELINE_SNAPSHOT, models: [] },
        { ...BASELINE_SNAPSHOT, snapshot_id: undefined },
        { ...BASELINE_SNAPSHOT, models: [{ title: "no id" }] },
    ];
    await withClient(async (client) => {
        for (const baseline of bad) {
            const result = await client.callTool({
                name: "diff_catalog",
                arguments: { baseline },
            });
            assert.equal(result.isError, true);
            const body = toolText(result);
            assert.equal(body.status, "history_unavailable");
            assert.equal(body.history_unavailable, true);
        }
    });
});

test("diff_catalog honors a fields subset and rejects unknown fields", async (t) => {
    const fetchMock = mockCatalogFetch(t);
    await withClient(async (client) => {
        const narrowed = await client.callTool({
            name: "diff_catalog",
            arguments: { baseline: BASELINE_SNAPSHOT, fields: ["title"] },
        });
        assert.notEqual(narrowed.isError, true);
        assert.deepEqual(toolText(narrowed).changed, []);

        const before = fetchMock.mock.callCount();
        const unknown = await client.callTool({
            name: "diff_catalog",
            arguments: {
                baseline: BASELINE_SNAPSHOT,
                fields: ["title", "nope"],
            },
        });
        assert.equal(unknown.isError, true);
        assert.equal(toolText(unknown).status, "unknown_diff_field");
        // A bad fields subset must fail before any upstream fetch.
        assert.equal(fetchMock.mock.callCount(), before);
    });
});

test("diff_catalog fetch failure never creates false removals", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    await withClient(async (client) => {
        const result = await client.callTool({
            name: "diff_catalog",
            arguments: { baseline: BASELINE_SNAPSHOT },
        });
        assert.equal(result.isError, true);
        const body = toolText(result);
        assert.equal(body.status, "fetch_failed");
        assert.equal(body.added, undefined);
        assert.equal(body.removed, undefined);
        assert.equal(body.changed, undefined);
    });
});

test("normalizeCatalog sorts, skips invalid entries, and rejects empties", () => {
    const { models, skipped } = normalizeCatalog(FRESH_RAW);
    assert.deepEqual(
        models.map((m) => m.id),
        ["brand/model-new", "openai/gpt-x", "steady/model"],
    );
    assert.equal(skipped, 1);
    assert.throws(() => normalizeCatalog({}), /Catalog response is not/);
    assert.throws(() => normalizeCatalog({ data: [] }), /zero usable models/);
});

test("snapshotId is deterministic and input-order independent", async () => {
    const { models: a } = normalizeCatalog(FRESH_RAW);
    const reversed = {
        object: "list",
        data: [...FRESH_RAW.data].reverse(),
    };
    const { models: b } = normalizeCatalog(reversed);
    assert.equal(await snapshotId(a), await snapshotId(b));
    assert.match(stableStringify({ b: 1, a: [3, 2] }), /"a":\[3,2\],"b":1/);
    assert.ok(COMPARABLE_FIELDS.includes("pricing"));
    assert.ok(!COMPARABLE_FIELDS.includes("health"));
});

test("validateBaseline accepts normalized snapshots and rejects junk", () => {
    const good = validateBaseline(BASELINE_SNAPSHOT);
    assert.equal(good.ok, true);
    assert.equal(validateBaseline(null).ok, false);
    assert.equal(validateBaseline({ models: [] }).ok, false);
});

test("oversized and duplicate-id baselines are history_unavailable", () => {
    const huge = {
        ...BASELINE_SNAPSHOT,
        models: Array.from({ length: 5001 }, (_, i) => ({ id: `m/${i}` })),
    };
    const capped = validateBaseline(huge);
    assert.equal(capped.ok, false);
    assert.match(capped.reason, /above the 5000 bound/);

    const duped = {
        ...BASELINE_SNAPSHOT,
        models: [{ id: "a" }, { id: "a" }],
    };
    const dupResult = validateBaseline(duped);
    assert.equal(dupResult.ok, false);
    assert.match(dupResult.reason, /duplicate model id/);

    assert.throws(
        () => normalizeCatalog({ data: [{ id: "a" }, { id: "a" }] }),
        /duplicate model id/,
    );
});

test("resolveDiffFields dedupes and rejects junk without fetching", () => {
    assert.deepEqual(resolveDiffFields(undefined), COMPARABLE_FIELDS);
    assert.deepEqual(resolveDiffFields(["title", "title", "pricing"]), [
        "title",
        "pricing",
    ]);
    assert.throws(() => resolveDiffFields(["nope"]), /Unknown diff field/);
    assert.throws(() => resolveDiffFields([]), /non-empty array/);
    assert.throws(
        () => resolveDiffFields(Array.from({ length: 21 }, (_, i) => `f${i}`)),
        /at most 20/,
    );
});

test("reordered object arrays do not manufacture changes", () => {
    // Entries pass through the same normalization the worker applies.
    const leftModels = [
        {
            id: "m",
            tools: [{ name: "b" }, { name: "a" }],
            supported_parameters: [{ x: 1 }, { x: 0 }],
        },
    ].map(normalizeModel);
    const rightModels = [
        {
            id: "m",
            tools: [{ name: "a" }, { name: "b" }],
            supported_parameters: [{ x: 0 }, { x: 1 }],
        },
    ].map(normalizeModel);
    const diff = diffSnapshots(
        {
            snapshot_id: "l",
            observed_at: "2026-10-10T00:00:00.000Z",
            models: leftModels,
        },
        {
            snapshot_id: "r",
            observed_at: "2026-10-11T00:00:00.000Z",
            source: "s",
            model_count: 1,
            models: rightModels,
        },
    );
    assert.deepEqual(diff.counts, { added: 0, removed: 0, changed: 0 });
});

test("arrays nested inside object fields stay order-sensitive", () => {
    // Pins the documented canonicalize scope: top-level field arrays are
    // order-normalized, but lists nested inside an object-valued field are
    // compared in order (order may be meaningful there; never blind-sorted).
    const left = normalizeModel({
        id: "m",
        pricing: { currency: "pollen", tiers: ["a", "b"] },
    });
    const reordered = normalizeModel({
        id: "m",
        pricing: { currency: "pollen", tiers: ["b", "a"] },
    });
    const keyReordered = normalizeModel({
        id: "m",
        pricing: { tiers: ["a", "b"], currency: "pollen" },
    });
    const base = {
        snapshot_id: "l",
        observed_at: "2026-10-10T00:00:00.000Z",
        models: [left],
    };
    const currentBase = {
        snapshot_id: "r",
        observed_at: "2026-10-11T00:00:00.000Z",
        source: "s",
        model_count: 1,
    };
    const nestedReorder = diffSnapshots(base, {
        ...currentBase,
        models: [reordered],
    });
    assert.deepEqual(nestedReorder.counts, {
        added: 0,
        removed: 0,
        changed: 1,
    });
    assert.deepEqual(
        nestedReorder.changed[0].changes.map((c) => c.field),
        ["pricing"],
    );
    // Object key order is still insignificant (stableStringify sorts keys).
    const keyOrder = diffSnapshots(base, {
        ...currentBase,
        models: [keyReordered],
    });
    assert.deepEqual(keyOrder.counts, { added: 0, removed: 0, changed: 0 });
});

test("catalog retrieval is downstream passthrough, not billed generation", async (t) => {
    // The caller key flows to exactly one GET on the public catalog surface.
    // No generation endpoint is touched, so the gateway has nothing billable
    // to account (mirrors the ask-jev downstream shape minus a model call).
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen.push({
            url: String(input),
            method: init?.method ?? "GET",
            authorization: new Headers(init?.headers).get("authorization"),
            body: init?.body === undefined ? null : String(init.body),
        });
        return Response.json({ object: "list", data: [{ id: "only/model" }] });
    });
    await withClient(async (client) => {
        const result = await client.callTool({
            name: "get_catalog",
            arguments: {},
        });
        assert.notEqual(result.isError, true);
        assert.equal(toolText(result).model_count, 1);
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://gen.pollinations.ai/v1/models");
    assert.equal(seen[0].method, "GET");
    assert.equal(seen[0].authorization, `Bearer ${TOKEN}`);
    assert.equal(seen[0].body, null);
});

test("diffSnapshots is empty when nothing changed", async (t) => {
    mockCatalogFetch(t);
    await withClient(async (client) => {
        const snap = toolText(
            await client.callTool({ name: "get_catalog", arguments: {} }),
        );
        const again = toolText(
            await client.callTool({
                name: "diff_catalog",
                arguments: { baseline: snap },
            }),
        );
        assert.deepEqual(again.counts, { added: 0, removed: 0, changed: 0 });
        assert.deepEqual(
            [again.added, again.removed, again.changed],
            [[], [], []],
        );
        // Round-trip through diffSnapshots directly as well.
        const direct = diffSnapshots({ ...snap, models: snap.models }, snap);
        assert.deepEqual(direct.counts, { added: 0, removed: 0, changed: 0 });
    });
});
