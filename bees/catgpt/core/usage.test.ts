import assert from "node:assert/strict";
import { test } from "node:test";

import { coerceOpenAIUsage, recordUsage } from "./usage.ts";

test("recordUsage computes cost from claude-fast pricing", () => {
    // 1000 prompt tokens × $1.1e-6 + 500 completion × $5.5e-6 = $0.00385
    const out = recordUsage({
        prompt_tokens: 1000,
        completion_tokens: 500,
        model: "claude-fast",
    });
    assert.equal(out.estimated, false);
    assert.ok(Math.abs(out.cost_dollars - 0.00385) < 1e-9);
    assert.equal(out.cost_pollen, out.cost_dollars);
});

test("recordUsage handles aliases", () => {
    const a = recordUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        model: "claude-fast",
    });
    const b = recordUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        model: "claude-haiku",
    });
    assert.equal(a.cost_dollars, b.cost_dollars);
});

test("recordUsage marks unknown models as estimated with zero cost", () => {
    const out = recordUsage({
        prompt_tokens: 9999,
        completion_tokens: 9999,
        model: "totally-not-a-model",
    });
    assert.equal(out.estimated, true);
    assert.equal(out.cost_dollars, 0);
    assert.equal(out.cost_pollen, 0);
});

test("recordUsage with zero tokens is zero cost (not NaN)", () => {
    const out = recordUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        model: "claude-fast",
    });
    assert.equal(out.cost_dollars, 0);
    assert.equal(out.cost_pollen, 0);
    assert.equal(out.estimated, false);
});

test("recordUsage charges more for completion than prompt at same volume", () => {
    // sanity: completion tokens cost more (5.5x for claude-fast)
    const prompt = recordUsage({
        prompt_tokens: 1000,
        completion_tokens: 0,
        model: "claude-fast",
    });
    const completion = recordUsage({
        prompt_tokens: 0,
        completion_tokens: 1000,
        model: "claude-fast",
    });
    assert.ok(completion.cost_dollars > prompt.cost_dollars);
});

test("coerceOpenAIUsage extracts well-formed usage", () => {
    const usage = coerceOpenAIUsage(
        { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
        "claude-fast",
    );
    assert.deepEqual(usage, {
        prompt_tokens: 12,
        completion_tokens: 34,
        model: "claude-fast",
    });
});

test("coerceOpenAIUsage returns null for non-objects", () => {
    assert.equal(coerceOpenAIUsage(null, "claude-fast"), null);
    assert.equal(coerceOpenAIUsage(undefined, "claude-fast"), null);
    assert.equal(coerceOpenAIUsage("not-an-object", "claude-fast"), null);
});

test("coerceOpenAIUsage falls back to zero for missing fields", () => {
    const usage = coerceOpenAIUsage({}, "claude-fast");
    assert.deepEqual(usage, {
        prompt_tokens: 0,
        completion_tokens: 0,
        model: "claude-fast",
    });
});
