import assert from "node:assert/strict";
import test from "node:test";
import { payloads } from "./scripts/apply-ui-defaults.mjs";
import {
    BANNERS,
    DEFAULT_MODEL,
    PINNED_MODELS,
    PROMPT_SUGGESTIONS,
} from "./ui-defaults.js";

const BANNER_TYPES = new Set(["info", "success", "warning", "error"]);

test("banners carry every field BannerModel requires", () => {
    assert.ok(BANNERS.length > 0);
    for (const banner of BANNERS) {
        assert.equal(typeof banner.id, "string");
        assert.ok(banner.id.length > 0);
        assert.ok(BANNER_TYPES.has(banner.type), banner.type);
        assert.equal(typeof banner.content, "string");
        assert.ok(banner.content.length > 0);
        assert.equal(typeof banner.dismissible, "boolean");
        assert.equal(typeof banner.timestamp, "number");
        assert.equal("title" in banner, false);
    }
    assert.equal(
        new Set(BANNERS.map((banner) => banner.id)).size,
        BANNERS.length,
    );
});

test("suggestions use the {title: string[], content} shape", () => {
    assert.ok(PROMPT_SUGGESTIONS.length > 0);
    for (const suggestion of PROMPT_SUGGESTIONS) {
        assert.ok(Array.isArray(suggestion.title));
        assert.ok(suggestion.title.length > 0);
        for (const line of suggestion.title) {
            assert.equal(typeof line, "string");
            assert.ok(line.length > 0);
        }
        assert.equal(typeof suggestion.content, "string");
        assert.ok(suggestion.content.length > 0);
        // A plain string would render as one unbroken blob, not the two-line
        // chip the frontend draws.
        assert.equal(typeof suggestion.title, "object");
    }
});

test("the default model is a real, unique, pinned id", () => {
    assert.equal(PINNED_MODELS.includes(DEFAULT_MODEL), true);
    assert.equal(new Set(PINNED_MODELS).size, PINNED_MODELS.length);
    for (const id of [...PINNED_MODELS, DEFAULT_MODEL]) {
        // The bug this replaces: DEFAULT_MODELS was "openai", a prefix with no
        // matching id, so the picker silently fell back to a random model.
        assert.match(id, /^[\w.-]+\/[\w.:-]+$/, id);
    }
});

test("every pinned model exists in the live catalog", async (t) => {
    let models;
    try {
        const response = await fetch("https://gen.pollinations.ai/v1/models");
        if (!response.ok) throw new Error(String(response.status));
        models = (await response.json()).data;
    } catch (error) {
        t.skip(`catalog unreachable: ${error.message}`);
        return;
    }

    const byId = new Map(models.map((model) => [model.id, model]));
    for (const id of PINNED_MODELS) {
        const model = byId.get(id);
        assert.ok(model, `${id} is not in gen's catalog`);
        assert.equal(model.category, "text", id);
        assert.equal(model.tools, true, id);
        assert.ok(model.description, `${id} has no description`);
    }
});

test("apply payloads keep the stored config and override only our keys", () => {
    const stored = {
        DEFAULT_MODELS: "openai",
        DEFAULT_PINNED_MODELS: null,
        MODEL_ORDER_LIST: null,
        DEFAULT_MODEL_METADATA: { capabilities: { builtin_tools: false } },
        DEFAULT_MODEL_PARAMS: { temperature: 0.5 },
    };
    const merged = payloads.models(stored);

    assert.equal(merged.DEFAULT_MODELS, DEFAULT_MODEL);
    assert.equal(merged.DEFAULT_PINNED_MODELS, PINNED_MODELS.join(","));
    assert.deepEqual(merged.MODEL_ORDER_LIST, null);
    assert.equal(merged.MODEL_ORDER_LIST, stored.MODEL_ORDER_LIST);
    // Resetting this would switch the builtin tools back on, which managed
    // agents reject with a 400 on every chat.
    assert.deepEqual(merged.DEFAULT_MODEL_METADATA, {
        capabilities: { builtin_tools: false },
    });
    assert.deepEqual(merged.DEFAULT_MODEL_PARAMS, { temperature: 0.5 });
});

test("suggestion and banner payloads match the routes' schemas", () => {
    assert.ok(Array.isArray(payloads.suggestions.suggestions));
    assert.equal(payloads.suggestions.i18n, null);
    assert.ok(Array.isArray(payloads.banners));
    assert.equal(payloads.banners, BANNERS);
});
