import assert from "node:assert/strict";
import test from "node:test";
import {
    aggregateHealth,
    pickModel,
    requirements,
} from "./agent.ts";

type CatalogModel = {
    id: string;
    category?: string;
    community?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    supported_endpoints?: string[];
    capabilities?: string[];
    tools?: boolean;
    context_length?: number;
    pricing?: { promptTextTokens?: string; completionTextTokens?: string };
};

const catalogOf = (entries: CatalogModel[]) =>
    entries.map((entry) => ({
        category: "text",
        community: false,
        output_modalities: ["text"],
        input_modalities: ["text"],
        supported_endpoints: ["/v1/responses"],
        ...entry,
    }));

const row = (
    model: string,
    { total = 0, ok = 0, failed = 0, p95 = 0 } = {},
) => ({
    model,
    event_type: "generate.text",
    is_rollup: 1,
    total_requests: total,
    status_2xx: ok,
    errors_5xx: failed,
    latency_p95_ms: p95 || null,
});

test("requirements: plain text", () => {
    const r = requirements({ input: "What is 2+2?" });
    assert.equal(r.needsImage, false);
    assert.equal(r.needsTools, false);
    assert.equal(r.chars, 12);
});

test("requirements: image part is detected", () => {
    const r = requirements({
        input: [
            { type: "input_text", text: "describe" },
            { type: "input_image", image_url: "https://x/y.png" },
        ],
    });
    assert.equal(r.needsImage, true);
});

test("requirements: tool-calling is detected", () => {
    const r = requirements({
        input: "hi",
        tools: [{ type: "function", name: "f" }],
    });
    assert.equal(r.needsTools, true);
});

test("aggregateHealth: 5xx majority marks broken, low traffic and 4xx do not", () => {
    const health = aggregateHealth([
        row("broken", { total: 10, ok: 4, failed: 6 }),
        row("busy-ok", { total: 100, ok: 99, failed: 1, p95: 900 }),
        row("low", { total: 2, ok: 0, failed: 2 }),
        { model: "ignored", event_type: "generate.image", is_rollup: 1, total_requests: 999, errors_5xx: 999 },
    ]);
    assert.equal(health.get("broken")?.broken, true);
    assert.equal(health.get("busy-ok")?.broken, false);
    assert.equal(health.get("low")?.broken, false);
    assert.equal(health.has("ignored"), false);
});

test("pickModel: cheapest healthy eligible model wins", () => {
    const catalog = catalogOf([
        { id: "cheap", pricing: { promptTextTokens: "1", completionTextTokens: "1" } },
        { id: "mid", pricing: { promptTextTokens: "3", completionTextTokens: "3" } },
        { id: "pricey", pricing: { promptTextTokens: "9", completionTextTokens: "9" } },
    ]);
    const health = aggregateHealth([row("cheap", { total: 10, ok: 10 })]);
    const { model } = pickModel({ input: "hi" }, catalog, health);
    assert.equal(model, "cheap");
});

test("pickModel: skips a broken model even when cheapest", () => {
    const catalog = catalogOf([
        { id: "broken", pricing: { promptTextTokens: "1", completionTextTokens: "1" } },
        { id: "ok", pricing: { promptTextTokens: "5", completionTextTokens: "5" } },
    ]);
    const health = aggregateHealth([row("broken", { total: 10, ok: 4, failed: 6 })]);
    const { model } = pickModel({ input: "hi" }, catalog, health);
    assert.equal(model, "ok");
});

test("pickModel: image request routes to a vision model", () => {
    const catalog = catalogOf([
        { id: "text-only", pricing: { promptTextTokens: "1", completionTextTokens: "1" } },
        { id: "vision", input_modalities: ["text", "image"], pricing: { promptTextTokens: "4", completionTextTokens: "4" } },
    ]);
    const { model, reason } = pickModel(
        { input: [{ type: "input_image", image_url: "https://x/y.png" }] },
        catalog,
        new Map(),
    );
    assert.equal(model, "vision");
    assert.match(reason, /image input/);
});

test("pickModel: tool request routes to a tool-calling model", () => {
    const catalog = catalogOf([
        { id: "plain", pricing: { promptTextTokens: "1", completionTextTokens: "1" } },
        { id: "tools", tools: true, pricing: { promptTextTokens: "4", completionTextTokens: "4" } },
    ]);
    const { model } = pickModel(
        { input: "hi", tools: [{ type: "function", name: "f" }] },
        catalog,
        new Map(),
    );
    assert.equal(model, "tools");
});

test("pickModel: never routes to a community agent", () => {
    const catalog = catalogOf([
        { id: "community/x/router", community: true, pricing: { promptTextTokens: "0.0000001", completionTextTokens: "0.0000001" } },
        { id: "real", pricing: { promptTextTokens: "2", completionTextTokens: "2" } },
    ]);
    const { model } = pickModel({ input: "hi" }, catalog, new Map());
    assert.equal(model, "real");
});