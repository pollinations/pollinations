import assert from "node:assert/strict";
import { test } from "node:test";

import {
    estimateModelCost,
    estimateTokens,
    fetchTextModels,
    hasPricing,
    matchesName,
    normalizeModelName,
    normalizePricing,
    normalizeTextModel,
    pairCommunityWithOfficial,
    requestCost,
    selectModels,
    shortModelName,
    type TextModel,
    tokenLimitParameter,
} from "./src/catalog.mts";

function model(name: string, fields: Partial<TextModel> = {}): TextModel {
    return {
        name,
        aliases: [],
        title: "",
        publisher: "",
        community: name.startsWith("community/"),
        specialized: false,
        health: "healthy",
        pricing: {
            promptTextTokens: 0,
            completionTextTokens: 0,
            promptCachedTokens: 0,
        },
        supportedParameters: [],
        ...fields,
    };
}

function catalogPayload() {
    return [
        {
            name: "openai/gpt-6-luna",
            aliases: ["gpt-6", "luna"],
            title: "GPT-6 Luna",
            publisher: "OpenAI",
            community: false,
            is_specialized: false,
            category: "text",
            health: { status: "healthy" },
            pricing: {
                currency: "pollen",
                promptTextTokens: 1e-6,
                completionTextTokens: 3e-6,
                promptCachedTokens: 5e-7,
            },
            supported_parameters: ["seed", "max_tokens"],
        },
        {
            name: "community/Saauf/gpt-6-luna",
            title: "GPT-6 Luna (community)",
            community: true,
            category: "text",
            health: { status: "degraded" },
            pricing: null,
            supported_parameters: ["seed"],
        },
        { name: "pollinations/midijourney", category: "image" },
        { category: "text" },
        { name: "typesafe/jev-1.13", category: "text", is_specialized: true },
    ];
}

test("normalizeTextModel reads the catalog shape and rejects foreign entries", () => {
    const parsed = normalizeTextModel(catalogPayload()[0]);
    assert.ok(parsed);
    assert.equal(parsed.name, "openai/gpt-6-luna");
    assert.deepEqual(parsed.aliases, ["gpt-6", "luna"]);
    assert.equal(parsed.community, false);
    assert.equal(parsed.health, "healthy");
    assert.equal(parsed.pricing.completionTextTokens, 3e-6);
    assert.deepEqual(parsed.supportedParameters, ["seed", "max_tokens"]);

    assert.equal(normalizeTextModel({ category: "text" }), null);
    assert.equal(normalizeTextModel(null), null);
    assert.equal(normalizeTextModel("openai/gpt-6"), null);
});

test("normalizeTextModel defaults missing pricing and health", () => {
    const parsed = normalizeTextModel(catalogPayload()[1]);
    assert.ok(parsed);
    assert.equal(parsed.health, "degraded");
    assert.deepEqual(parsed.pricing, {
        promptTextTokens: 0,
        completionTextTokens: 0,
        promptCachedTokens: 0,
    });
    assert.equal(hasPricing(parsed), false);
    const bare = normalizeTextModel({ name: "community/x/y" });
    assert.ok(bare);
    assert.equal(bare.health, "unknown");
});

test("normalizePricing ignores non-numeric and null prices", () => {
    assert.deepEqual(normalizePricing(null), {
        promptTextTokens: 0,
        completionTextTokens: 0,
        promptCachedTokens: 0,
    });
    assert.deepEqual(
        normalizePricing({
            promptTextTokens: null,
            completionTextTokens: "",
            promptCachedTokens: "not a price",
        }),
        {
            promptTextTokens: 0,
            completionTextTokens: 0,
            promptCachedTokens: 0,
        },
    );
});

test("normalizePricing reads the decimal strings the API returns", () => {
    assert.deepEqual(
        normalizePricing({
            promptTextTokens: "0.0000001",
            completionTextTokens: "0.0000005",
            promptCachedTokens: "0.00000001",
        }),
        {
            promptTextTokens: 0.0000001,
            completionTextTokens: 0.0000005,
            promptCachedTokens: 0.00000001,
        },
    );
});

test("fetchTextModels keeps text models, drops specialised ones and sorts by name", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify(catalogPayload()), { status: 200 });
    };
    const models = await fetchTextModels({
        apiKey: "k",
        baseUrl: "https://example.test",
        fetchImpl,
    });
    assert.deepEqual(calls, ["https://example.test/text/models"]);
    assert.deepEqual(
        models.map((entry) => entry.name),
        ["community/Saauf/gpt-6-luna", "openai/gpt-6-luna"],
    );
    const withSpecialized = await fetchTextModels({
        apiKey: "k",
        baseUrl: "https://example.test",
        fetchImpl,
        includeSpecialized: true,
    });
    assert.equal(withSpecialized.length, 3);
});

test("fetchTextModels surfaces an HTTP failure", async () => {
    const fetchImpl = async () => new Response("nope", { status: 503 });
    await assert.rejects(
        () =>
            fetchTextModels({
                apiKey: "k",
                baseUrl: "https://example.test",
                fetchImpl,
            }),
        /HTTP 503/,
    );
});

test("tokenLimitParameter only returns parameters the model advertises", () => {
    assert.equal(
        tokenLimitParameter(model("a", { supportedParameters: ["seed"] })),
        null,
    );
    assert.equal(
        tokenLimitParameter(
            model("a", { supportedParameters: ["max_completion_tokens"] }),
        ),
        "max_completion_tokens",
    );
    assert.equal(
        tokenLimitParameter(
            model("a", {
                supportedParameters: ["max_tokens", "max_completion_tokens"],
            }),
        ),
        "max_tokens",
    );
});

test("price math multiplies usage by the published rate", () => {
    const priced = model("openai/gpt-6-luna", {
        pricing: {
            promptTextTokens: 1e-6,
            completionTextTokens: 3e-6,
            promptCachedTokens: 5e-7,
        },
    });
    assert.ok(
        Math.abs(
            requestCost(priced, { prompt: 50, completion: 10 }) -
                (50e-6 + 30e-6),
        ) < 1e-15,
    );
    assert.equal(estimateTokens("a".repeat(41)), 11);
    const estimate = estimateModelCost(priced, {
        promptTokens: 50,
        maxOutputTokens: 100,
        questions: 9,
    });
    assert.ok(estimate > 0);
    assert.ok(Math.abs(estimate - (50e-6 + 300e-6) * 9) < 1e-15);
});

test("selectModels filters by half of the catalog and by explicit name", () => {
    const models = [
        model("openai/gpt-6-luna", { aliases: ["gpt-6"] }),
        model("community/Saauf/gpt-6-luna"),
        model("z-ai/glm-5.3-flash"),
    ];
    assert.equal(selectModels(models).length, 3);
    assert.deepEqual(
        selectModels(models, { filter: "official" }).map((entry) => entry.name),
        ["openai/gpt-6-luna", "z-ai/glm-5.3-flash"],
    );
    assert.deepEqual(
        selectModels(models, { filter: "community" }).map(
            (entry) => entry.name,
        ),
        ["community/Saauf/gpt-6-luna"],
    );
    assert.deepEqual(
        selectModels(models, {
            filter: "official",
            names: ["Saauf/gpt-6-luna"],
        }).map((entry) => entry.name),
        ["community/Saauf/gpt-6-luna"],
    );
    assert.deepEqual(
        selectModels(models, { names: ["gpt-6-luna", "gpt-6"] }).map(
            (entry) => entry.name,
        ),
        ["openai/gpt-6-luna", "community/Saauf/gpt-6-luna"],
    );
    assert.equal(matchesName(models[1], "community/saauf/gpt-6-luna"), true);
    assert.equal(matchesName(models[1], "glm"), false);
});

test("model names normalize across separators", () => {
    assert.equal(
        shortModelName("community/MarcosFRG/gpt-oss-120b"),
        "gpt-oss-120b",
    );
    assert.equal(shortModelName("openai/gpt-6-luna"), "gpt-6-luna");
    assert.equal(normalizeModelName("openai/gpt_oss_120b"), "gpt-oss-120b");
    assert.equal(
        normalizeModelName("community/x/gpt.oss.120b"),
        "gpt-oss-120b",
    );
});

test("community models are paired with the official model they are named after", () => {
    const models = [
        model("openai/gpt-6-luna"),
        model("community/Saauf/gpt-6-luna"),
        model("openai/gpt-5.6-luna"),
        model("community/AkshayCoder48/gpt-5-6-luna"),
        model("moonshotai/kimi-k3"),
        model("community/scriptsnsenses-sys/kimi-k3-free"),
        model("community/ZapGaming/llama3.1-8b-ultrafast"),
        model("community/Lorodn4x/deepseek-v4-pro-0813"),
    ];
    const pairs = pairCommunityWithOfficial(models);
    assert.deepEqual(pairs, [
        {
            community: "community/AkshayCoder48/gpt-5-6-luna",
            official: "openai/gpt-5.6-luna",
            match: "exact",
        },
        {
            community: "community/Saauf/gpt-6-luna",
            official: "openai/gpt-6-luna",
            match: "exact",
        },
        {
            community: "community/scriptsnsenses-sys/kimi-k3-free",
            official: "moonshotai/kimi-k3",
            match: "prefix",
        },
    ]);
    // Unrelated community names stay unpaired, and officials never pair with each other.
    assert.equal(
        pairCommunityWithOfficial(models.filter((entry) => !entry.community))
            .length,
        0,
    );
});
