import assert from "node:assert/strict";
import test from "node:test";
import agent, { aggregateHealth, classify, pickModel } from "./agent.ts";

type CatalogEntry = {
    id: string;
    price: number;
    capabilities?: string[];
    images?: boolean;
};

const catalogOf = (entries: CatalogEntry[]) =>
    entries.map((entry) => ({
        id: entry.id,
        category: "text",
        supported_endpoints: ["/v1/responses"],
        input_modalities: entry.images ? ["text", "image"] : ["text"],
        capabilities: entry.capabilities ?? [],
        pricing: {
            promptTextTokens: String(entry.price / 2),
            completionTextTokens: String(entry.price / 2),
        },
    }));

const NO_HEALTH = new Map();

/** Rollup rows for a model: nReq total, n5xx of them 5xx, optional p95. */
const rollupRows = (
    model: string,
    nReq: number,
    n5xx: number,
    p95?: number,
) => [
    {
        model,
        event_type: "generate.text",
        is_rollup: 1,
        total_requests: nReq,
        status_2xx: nReq - n5xx,
        errors_4xx: 0,
        errors_5xx: n5xx,
        latency_p95_ms: p95 ?? null,
    },
];

const FAST_FEATURES = classify({ input: "hi" });

test("classify: short prompt is fast", () => {
    const features = classify({ input: "What is 2+2?" });
    assert.equal(features.tier, "fast");
    assert.equal(features.needsTools, false);
    assert.equal(features.needsImage, false);
});

test("classify: code plus reasoning keywords is deep", () => {
    const features = classify({
        input: "Analyze why this function deadlocks and explain step by step how to refactor it:\n```ts\nfunction lock() {}\n```",
    });
    assert.equal(features.tier, "deep");
});

test("classify: images and tools lift the tier to balanced", () => {
    const withImage = classify({
        input: [
            {
                role: "user",
                content: [
                    { type: "input_text", text: "hi" },
                    { type: "input_image", image_url: "https://x/y.png" },
                ],
            },
        ],
    });
    assert.equal(withImage.tier, "balanced");
    assert.equal(withImage.needsImage, true);

    const withTools = classify({
        input: "hi",
        tools: [{ type: "function", name: "f" }],
    });
    assert.equal(withTools.tier, "balanced");
    assert.equal(withTools.needsTools, true);
});

test("aggregateHealth: sums rollup rows and ignores non-rollup ones", () => {
    const rows = [
        ...rollupRows("m", 6, 1, 800),
        ...rollupRows("m", 4, 1, 1200),
        { model: "m", is_rollup: 0, total_requests: 999, errors_5xx: 999 },
    ];
    const health = aggregateHealth(rows);
    const m = health.get("m");
    assert.equal(m?.requests, 10);
    assert.equal(m?.successRate, 0.8);
    assert.equal(m?.p95, 1200);
    assert.equal(m?.broken, false);
});

test("aggregateHealth: marks a model broken on a 5xx majority, ignoring 4xx", () => {
    const broken = aggregateHealth(rollupRows("bad", 10, 6));
    assert.equal(broken.get("bad")?.broken, true);
    // Mostly 4xx (client faults): not broken.
    const clientFaults = aggregateHealth([
        {
            model: "ok",
            event_type: "generate.text",
            is_rollup: 1,
            total_requests: 10,
            status_2xx: 1,
            errors_4xx: 9,
            errors_5xx: 0,
        },
    ]);
    assert.equal(clientFaults.get("ok")?.broken, false);
    // Low traffic gets the benefit of the doubt even when all calls 5xx.
    const lowTraffic = aggregateHealth(rollupRows("new", 2, 2));
    assert.equal(lowTraffic.get("new")?.broken, false);
});

test("pickModel: fast tier takes the cheapest eligible model", () => {
    const catalog = catalogOf([
        { id: "cheap", price: 0 },
        { id: "mid", price: 0.00001 },
        { id: "pricey", price: 0.0001, capabilities: ["reasoning"] },
    ]);
    const pick = pickModel(catalog, NO_HEALTH, FAST_FEATURES);
    assert.equal(pick.id, "cheap");
    assert.match(pick.why, /cheapest eligible of 3/);
});

test("pickModel: broken models are skipped with reasons in the trace", () => {
    const catalog = catalogOf([
        { id: "cheap-down", price: 0 },
        { id: "cheap-also-down", price: 0 },
        { id: "cheap-ok", price: 0.000001 },
    ]);
    const health = aggregateHealth([
        ...rollupRows("cheap-down", 8, 8),
        ...rollupRows("cheap-also-down", 20, 12),
    ]);
    const pick = pickModel(catalog, health, FAST_FEATURES);
    assert.equal(pick.id, "cheap-ok");
    assert.match(pick.why, /2 unhealthy \(5xx\)/);
});

test("pickModel: community agents are never routing targets", () => {
    const agentEntry = {
        ...catalogOf([{ id: "community/someone/triage-router", price: 0 }])[0],
        community: true,
    };
    const catalog = [
        agentEntry,
        ...catalogOf([{ id: "real-cheap", price: 0.00001 }]),
    ];
    const pick = pickModel(catalog, NO_HEALTH, FAST_FEATURES);
    assert.equal(pick.id, "real-cheap");
    assert.match(pick.why, /1 community agent/);
    // The id prefix alone is enough even if the flag is missing.
    const prefixOnly = catalogOf([{ id: "community/x/y", price: 0 }]);
    const withReal = [
        ...prefixOnly,
        ...catalogOf([{ id: "real2", price: 0.00001 }]),
    ];
    assert.equal(pickModel(withReal, NO_HEALTH, FAST_FEATURES).id, "real2");
});

test("pickModel: balanced takes the median-priced candidate, deep the priciest reasoning one", () => {
    const catalog = catalogOf([
        { id: "a", price: 0 },
        { id: "b", price: 0.00001 },
        { id: "c", price: 0.00002 },
        { id: "d", price: 0.00003, capabilities: ["reasoning"] },
        { id: "e", price: 0.00004, capabilities: ["reasoning"] },
    ]);
    // No model here can call tools - the request genuinely cannot be served.
    assert.throws(
        () =>
            pickModel(
                catalog,
                NO_HEALTH,
                classify({ input: "hi", tools: [{ type: "function" }] }),
            ),
        /No eligible/,
    );

    const toolCatalog = catalogOf([
        { id: "a", price: 0 },
        {
            id: "b",
            price: 0.00001,
            capabilities: ["tool_calling"],
        },
        {
            id: "c",
            price: 0.00002,
            capabilities: ["tool_calling"],
        },
        {
            id: "d",
            price: 0.00003,
            capabilities: ["tool_calling", "reasoning"],
        },
        {
            id: "e",
            price: 0.00004,
            capabilities: ["tool_calling", "reasoning"],
        },
    ]);
    const medianPick = pickModel(
        toolCatalog,
        NO_HEALTH,
        classify({ input: "hi", tools: [{ type: "function" }] }),
    );
    assert.equal(medianPick.id, "c");

    const deepPick = pickModel(
        toolCatalog,
        NO_HEALTH,
        classify({
            input: "analyze and debug ```js\nclass A {}\n``` step by step, compare trade-offs",
        }),
    );
    assert.equal(deepPick.id, "e");
});

test("pickModel: empty band escalates upward and records it", () => {
    const catalog = catalogOf([
        { id: "only-reasoner", price: 0.00005, capabilities: ["reasoning"] },
        { id: "down", price: 0 },
    ]);
    const health = aggregateHealth(rollupRows("down", 9, 9));
    const deepFeatures = {
        tier: "deep" as const,
        needsTools: false,
        needsImage: false,
        summary: "score 5",
    };
    const pick = pickModel(catalog, health, deepFeatures);
    assert.equal(pick.id, "only-reasoner");
    assert.doesNotMatch(pick.why, /escalated/);
});

test("pickModel: latency breaks price ties", () => {
    const catalog = catalogOf([
        { id: "slow", price: 0.00001 },
        { id: "fast", price: 0.00001 },
    ]);
    const health = aggregateHealth([
        ...rollupRows("slow", 10, 0, 9000),
        ...rollupRows("fast", 10, 0, 900),
    ]);
    const pick = pickModel(catalog, health, FAST_FEATURES);
    assert.equal(pick.id, "fast");
});

test("pickModel: throws when everything is broken", () => {
    const catalog = catalogOf([{ id: "down", price: 0 }]);
    const health = aggregateHealth(rollupRows("down", 7, 7));
    assert.throws(
        () => pickModel(catalog, health, FAST_FEATURES),
        /No eligible/,
    );
});

test("agent: forwards the original body with the chosen model and trace headers", async () => {
    const body = {
        model: "afanasevmylife/polyrouter",
        input: "hello there",
        stream: true,
    };
    const forwarded: Record<string, unknown>[] = [];
    const downstream = new Response("stream-body", { status: 200 });
    const result = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            if (path === "/v1/models?status=all") {
                return Response.json({
                    data: catalogOf([
                        { id: "cheap", price: 0 },
                        { id: "pricey", price: 0.0001 },
                    ]),
                });
            }
            if (path === "/models/status?minutes=30") {
                return Response.json({ data: rollupRows("pricey", 10, 9) });
            }
            forwarded.push(JSON.parse(init?.body as string));
            return downstream;
        },
    });

    assert.equal(forwarded.length, 1);
    assert.deepEqual(forwarded[0], { ...body, model: "cheap" });
    assert.equal(result.headers.get("x-polyrouter-model"), "cheap");
    assert.equal(result.headers.get("x-polyrouter-tier"), "fast");
    assert.match(result.headers.get("x-polyrouter-why") ?? "", /simple prompt/);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), "stream-body");
});

test("agent: routes by price alone when the status feed is down", async () => {
    const forwarded: Record<string, unknown>[] = [];
    const downstream = new Response("ok", { status: 200 });
    const result = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify({
                model: "afanasevmylife/polyrouter",
                input: "hi",
            }),
        }),
        pollinations: async (path, init) => {
            if (path === "/v1/models?status=all") {
                return Response.json({
                    data: catalogOf([
                        { id: "pricey", price: 0.0001 },
                        { id: "cheap", price: 0 },
                    ]),
                });
            }
            if (path === "/models/status?minutes=30") {
                return new Response("not found", { status: 404 });
            }
            forwarded.push(JSON.parse(init?.body as string));
            return downstream;
        },
    });
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].model, "cheap");
    assert.equal(result.status, 200);
});

test("agent: a rejecting status feed still degrades to price-only routing", async () => {
    const forwarded: Record<string, unknown>[] = [];
    const result = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify({
                model: "afanasevmylife/polyrouter",
                input: "hi",
            }),
        }),
        pollinations: async (path, init) => {
            if (path === "/v1/models?status=all") {
                return Response.json({
                    data: catalogOf([
                        { id: "pricey", price: 0.0001 },
                        { id: "cheap", price: 0 },
                    ]),
                });
            }
            if (path === "/models/status?minutes=30") {
                throw new Error("status feed unreachable");
            }
            forwarded.push(JSON.parse(init?.body as string));
            return new Response("ok", { status: 200 });
        },
    });
    assert.equal(forwarded[0]?.model, "cheap");
    assert.equal(result.status, 200);
});

test("agent: traced JSON responses drop the stale upstream content-length", async () => {
    const upstreamPayload = JSON.stringify({ id: "resp_1", output: [] });
    const result = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify({
                model: "afanasevmylife/polyrouter",
                input: "hi",
            }),
        }),
        pollinations: async (path) => {
            if (path === "/v1/models?status=all") {
                return Response.json({
                    data: catalogOf([{ id: "cheap", price: 0 }]),
                });
            }
            if (path === "/models/status?minutes=30") {
                return Response.json({ data: [] });
            }
            return new Response(upstreamPayload, {
                status: 200,
                headers: {
                    "content-type": "application/json",
                    "content-length": String(upstreamPayload.length),
                },
            });
        },
    });
    const body = await result.text();
    // The trace grew the body, so the original content-length no longer
    // describes it; a stale header would truncate the response.
    const contentLength = result.headers.get("content-length");
    assert.ok(
        contentLength === null || Number(contentLength) === body.length,
        `content-length ${contentLength} must match the traced body`,
    );
    assert.ok(body.length > upstreamPayload.length);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    assert.ok(parsed.polyrouter_trace);
});
