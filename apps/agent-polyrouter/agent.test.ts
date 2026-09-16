import assert from "node:assert/strict";
import test from "node:test";
import agent, { classify, pickModel } from "./agent.ts";

type CatalogEntry = {
    id: string;
    price: number;
    health?: string;
    capabilities?: string[];
    images?: boolean;
    successRate?: number;
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
        health: {
            status: entry.health ?? "healthy",
            success_rate: entry.successRate ?? 0.99,
        },
    }));

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

test("pickModel: fast tier takes the cheapest healthy model", () => {
    const catalog = catalogOf([
        { id: "cheap", price: 0 },
        { id: "mid", price: 0.00001 },
        { id: "pricey", price: 0.0001, capabilities: ["reasoning"] },
    ]);
    const pick = pickModel(catalog, [], FAST_FEATURES);
    assert.equal(pick.id, "cheap");
    assert.match(pick.why, /cheapest healthy of 3/);
});

test("pickModel: unhealthy models are skipped with reasons in the trace", () => {
    const catalog = catalogOf([
        { id: "cheap-down", price: 0, health: "down" },
        { id: "cheap-degraded", price: 0, health: "degraded" },
        { id: "cheap-ok", price: 0.000001 },
    ]);
    const pick = pickModel(catalog, [], FAST_FEATURES);
    assert.equal(pick.id, "cheap-ok");
    assert.match(pick.why, /1 health down/);
    assert.match(pick.why, /1 health degraded/);
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
                [],
                classify({ input: "hi", tools: [{ type: "function" }] }),
            ),
        /No healthy/,
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
        [],
        classify({ input: "hi", tools: [{ type: "function" }] }),
    );
    assert.equal(medianPick.id, "c");

    const deepPick = pickModel(
        toolCatalog,
        [],
        classify({
            input: "analyze and debug ```js\nclass A {}\n``` step by step, compare trade-offs",
        }),
    );
    assert.equal(deepPick.id, "e");
});

test("pickModel: empty band escalates upward and records it", () => {
    const catalog = catalogOf([
        { id: "only-reasoner", price: 0.00005, capabilities: ["reasoning"] },
        { id: "down", price: 0, health: "down" },
    ]);
    const deepFeatures = {
        tier: "deep" as const,
        needsTools: false,
        needsImage: false,
        summary: "score 5",
    };
    const pick = pickModel(catalog, [], deepFeatures);
    assert.equal(pick.id, "only-reasoner");
    assert.doesNotMatch(pick.why, /escalated/);
});

test("pickModel: latency breaks price ties", () => {
    const catalog = catalogOf([
        { id: "slow", price: 0.00001 },
        { id: "fast", price: 0.00001 },
    ]);
    const rows = [
        { model: "slow", event_type: "generate.text", latency_p95_ms: 9000 },
        { model: "fast", event_type: "generate.text", latency_p95_ms: 900 },
    ];
    const pick = pickModel(catalog, rows, FAST_FEATURES);
    assert.equal(pick.id, "fast");
});

test("pickModel: throws when nothing healthy exists", () => {
    const catalog = catalogOf([{ id: "down", price: 0, health: "down" }]);
    assert.throws(() => pickModel(catalog, [], FAST_FEATURES), /No healthy/);
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
            if (path === "/v1/models/status?minutes=30") {
                return Response.json({ data: [] });
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
