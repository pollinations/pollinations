import assert from "node:assert/strict";
import { test } from "node:test";

import {
    baseName,
    fetchTextModels,
    requestCostPollen,
    selectModels,
    shortName,
} from "./catalog.mjs";

const CATALOG = [
    {
        name: "openai/gpt-6-astra",
        aliases: ["gpt-6-astra"],
        category: "text",
        community: false,
        pricing: {
            currency: "pollen",
            promptTextTokens: "0.00000015",
            promptCachedTokens: "0.000000015",
            completionTextTokens: "0.0000009375",
        },
    },
    {
        name: "community/Saauf/gpt-6-luna",
        aliases: [],
        category: "text",
        community: true,
    },
    {
        name: "stability/sd-4",
        aliases: [],
        category: "image",
        community: false,
    },
];

async function fakeFetch(url) {
    assert.equal(url, "https://gen.example/text/models");
    return {
        ok: true,
        status: 200,
        json: async () => CATALOG,
    };
}

test("fetchTextModels keeps only text models", async () => {
    const models = await fetchTextModels("https://gen.example", fakeFetch);
    assert.equal(models.length, 2);
    assert.equal(models[0].name, "openai/gpt-6-astra");
});

test("fetchTextModels fails loudly on a bad catalog", async () => {
    await assert.rejects(
        fetchTextModels("https://gen.example", async () => ({
            ok: false,
            status: 500,
            json: async () => [],
        })),
        /Model list request failed: 500/,
    );
});

test("selectModels defaults to every text model", () => {
    assert.equal(selectModels(CATALOG.slice(0, 2)).length, 2);
});

test("selectModels filters by scope", () => {
    const models = CATALOG.slice(0, 2);
    assert.deepEqual(
        selectModels(models, { scope: "community" }).map((m) => m.name),
        ["community/Saauf/gpt-6-luna"],
    );
    assert.deepEqual(
        selectModels(models, { scope: "official" }).map((m) => m.name),
        ["openai/gpt-6-astra"],
    );
});

test("selectModels takes an explicit list by name or alias", () => {
    const models = CATALOG.slice(0, 2);
    assert.deepEqual(
        selectModels(models, { names: ["gpt-6-luna"] }).map((m) => m.name),
        ["community/Saauf/gpt-6-luna"],
    );
    assert.deepEqual(
        selectModels(models, {
            names: ["openai/gpt-6-astra", "community/Saauf/gpt-6-luna"],
        }).map((m) => m.name),
        ["openai/gpt-6-astra", "community/Saauf/gpt-6-luna"],
    );
    assert.throws(
        () => selectModels(models, { names: ["nope"] }),
        /Unknown model\(s\): nope/,
    );
});

test("requestCostPollen prices prompt, cached and completion tokens", () => {
    const model = CATALOG[0];
    const cost = requestCostPollen(model, {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 400 },
    });
    // 600 uncached * 0.00000015 + 400 cached * 0.000000015 + 200 * 0.0000009375
    assert.ok(Math.abs(cost - 0.0002835) < 1e-9, `got ${cost}`);
    assert.equal(requestCostPollen(CATALOG[1], {}), null);
});

test("name helpers strip paths and variants", () => {
    assert.equal(shortName("community/Saauf/gpt-6-luna"), "gpt-6-luna");
    assert.equal(baseName("community/vendouple/gpt-6-sol:stable"), "gpt-6-sol");
    assert.equal(baseName("openai/gpt-6-astra"), "gpt-6-astra");
});

test("reasoning and cache writes use their own rates without double-counting", () => {
    const model = {
        pricing: {
            promptTextTokens: 1,
            promptCachedTokens: 0.1,
            promptCacheWriteTokens: 2,
            completionTextTokens: 3,
            completionReasoningTokens: 4,
        },
    };
    assert.equal(
        requestCostPollen(model, {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: {
                cached_tokens: 10,
                cache_write_tokens: 20,
            },
            completion_tokens_details: { reasoning_tokens: 30 },
        }),
        291,
    );
    assert.equal(
        requestCostPollen(model, {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 150,
            completion_tokens_details: { reasoning_tokens: 30 },
        }),
        280,
    );
});

test("duplicate aliases resolve to one model", () => {
    assert.equal(
        selectModels(CATALOG, { names: ["gpt-6-astra", "openai/gpt-6-astra"] })
            .length,
        1,
    );
});
