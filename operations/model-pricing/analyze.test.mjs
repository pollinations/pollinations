import assert from "node:assert/strict";
import { test } from "node:test";
import {
    agentEvidence,
    azureLifecycle,
    azureRates,
    coverageFor,
    findingsFor,
    openRouterRates,
    pinnedEndpoint,
    rate,
    standardEndpoint,
    validateAssessment,
} from "./analyze.mjs";
import {
    catalogFacts,
    catalogHeaders,
    matchCatalogModel,
} from "./catalogs.mjs";

test("Azure prices match exact deployed SKU, unit, date and region; unknown is not free", () => {
    const meter = {
        skuName: "5.4 mini Inp Gl",
        armRegionName: "eastus",
        currencyCode: "USD",
        type: "Consumption",
        tierMinimumUnits: 0,
        effectiveStartDate: "2026-03-01",
        unitOfMeasure: "1M",
        retailPrice: 0.75,
    };
    const items = [
        meter,
        { ...meter, skuName: "5.4 mini Batch Inp Gl", retailPrice: 0.375 },
        { ...meter, skuName: "5.4 mini Inp Dz", retailPrice: 0.825 },
        { ...meter, armRegionName: "swedencentral", retailPrice: 9 },
        { ...meter, effectiveStartDate: "2027-01-01", retailPrice: 7 },
    ];
    const global = azureRates(
        items,
        "gpt-5.4-mini",
        "GlobalStandard",
        "eastus",
        "2026-10-06",
    );
    assert.equal(global.rates.promptTextTokens, 0.75 / 1e6);
    assert.equal(global.rates.completionTextTokens, null);
    assert.equal(
        azureRates(
            items,
            "gpt-5.4-mini",
            "DataZoneStandard",
            "eastus",
            "2026-10-06",
        ).rates.promptTextTokens,
        0.825 / 1e6,
    );
    assert.equal(
        azureRates(
            [...items, { ...meter, retailPrice: 1 }],
            "gpt-5.4-mini",
            "GlobalStandard",
            "eastus",
            "2026-10-06",
        ).rates.promptTextTokens,
        null,
    );
    for (const bad of [null, undefined, "", " ", true, false, {}, -1, "NaN"])
        assert.equal(rate(bad), null);
    assert.equal(rate("0"), 0);
    assert.equal(
        openRouterRates({ prompt: "0", completion: "0.000002" })
            .promptTextTokens,
        0,
    );
    assert.equal(openRouterRates({}).promptCachedTokens, null);
    const luna = {
        ...meter,
        skuName: "6-luna ShortCo Inp Std Gl",
        retailPrice: 0.1,
    };
    assert.equal(
        azureRates(
            [
                luna,
                {
                    ...luna,
                    skuName: "6-luna LongCo Inp Std Gl",
                    retailPrice: 0.2,
                },
            ],
            "gpt-6-luna",
            "GlobalStandard",
            "eastus",
            "2026-10-06",
        ).rates.promptTextTokens,
        0.1 / 1e6,
    );
});

test("Lifecycle uses the deployed SKU, never another SKU or fine-tuning deadline", () => {
    const model = {
        lifecycleStatus: "Deprecating",
        deprecation: { inference: "2026-12-09", fineTune: "2026-01-01" },
        skus: [
            { name: "Standard", deprecationDate: "2026-03-31" },
            { name: "GlobalStandard", deprecationDate: "2026-12-09" },
        ],
    };
    assert.equal(
        azureLifecycle(model, "GlobalStandard").retirementDate,
        "2026-12-09",
    );
    assert.equal(
        azureLifecycle(model, "Standard").retirementDate,
        "2026-03-31",
    );
    assert.equal(azureLifecycle({}, "GlobalStandard").retirementDate, null);
    assert.equal(
        standardEndpoint({ status: 0, tag: "openai/flex", name: "OpenAI" }),
        false,
    );
    assert.equal(
        standardEndpoint({ status: 0, tag: "openai", name: "OpenAI" }),
        true,
    );
    const endpoint = {
        status: 0,
        tag: "inception",
        provider_name: "Inception",
        model_id: "inception/mercury-2",
    };
    const options = { only: ["Inception"], allow_fallbacks: false };
    assert.equal(
        pinnedEndpoint([endpoint], options, endpoint.model_id),
        endpoint,
    );
    assert.equal(
        pinnedEndpoint(
            [endpoint, { ...endpoint, tag: "inception/flex" }],
            options,
            endpoint.model_id,
        ),
        null,
    );
});

test("OpenRouter advertised discounts are not applied twice; premium tiers are not standard alternatives", () => {
    // The public endpoint/UI already advertises $0.66/M after its 50% discount.
    // https://openrouter.ai/provider/streamlake
    const prices = openRouterRates({
        prompt: "0.00000066",
        completion: "0.00000198",
        discount: 0.5,
    });
    assert.equal(prices.promptTextTokens, 0.00000066 * 1.055);
    assert.equal(prices.completionTextTokens, 0.00000198 * 1.055);
    assert.equal(prices.promptCachedTokens, null);
    assert.equal(openRouterRates({ prompt: null }).promptTextTokens, null);
    for (const tier of ["priority", "fast", "flex", "batch", "free"])
        assert.equal(
            standardEndpoint({ status: 0, tag: `provider/${tier}` }),
            false,
        );
});

test("Only evidenced differences create stable findings; the agent can only select them", () => {
    const row = {
        name: "lab/model",
        provider: "azure",
        route: { sku: "GlobalStandard", region: "eastus" },
        configuredCost: { promptTextTokens: 1e-6 },
        observedRates: { promptTextTokens: null },
        exactPrice: true,
        retirementDate: null,
        evidence: ["https://example.com/source"],
        gaps: [],
    };
    assert.deepEqual(findingsFor([row], "2026-10-06"), []);
    row.observedRates.promptTextTokens = 0;
    const findings = findingsFor([row], "2026-10-06");
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, findingsFor([row], "2026-10-07")[0].id);
    const id = findings[0].id;
    row.route = { region: "eastus", model: undefined, sku: "GlobalStandard" };
    assert.equal(findingsFor([row], "2026-10-06")[0].id, id);
    row.route = { sku: "GlobalStandard", model: undefined, region: "eastus" };
    assert.equal(
        findingsFor([JSON.parse(JSON.stringify(row))], "2026-10-06")[0].id,
        id,
    );
    const input = agentEvidence({
        observations: [row, { name: "unaffected/model" }],
        findings,
    });
    assert.deepEqual(input.observations, [row]);
    assert.equal(input.observedRoutes, 2);
    assert.deepEqual(
        validateAssessment(
            JSON.stringify({ prioritizedFindingIds: [id] }),
            findings,
        ),
        [id],
    );
    assert.throws(() =>
        validateAssessment('{"prioritizedFindingIds":["invented"]}', findings),
    );
    assert.throws(() =>
        validateAssessment(
            JSON.stringify({ prioritizedFindingIds: [id, id] }),
            findings,
        ),
    );
    assert.throws(() =>
        validateAssessment(
            '{"prioritizedFindingIds":[],"price":123}',
            findings,
        ),
    );
});

test("Coverage retains unknown providers, media and fallback routes without inventing verification", () => {
    const inventory = [
        {
            name: "text",
            provider: "xai",
            category: "text",
            cost: { promptTextTokens: 2e-6, completionTextTokens: 6e-6 },
            costVariants: { long: {} },
        },
        {
            name: "media",
            provider: "new-provider",
            category: "image",
            cost: { completionImageTokens: 0.1 },
        },
        {
            name: "fallback",
            provider: "new-provider",
            category: "video",
            cost: {},
            hidden: true,
            fallbackOnly: true,
        },
    ];
    const observations = [
        {
            name: "text",
            evidence: ["https://api.x.ai/v1/language-models"],
            exactPrice: true,
            observedRates: { promptTextTokens: 2e-6 },
            catalogMatch: true,
        },
        { name: "media", evidence: ["https://example.com/failed"] },
    ];
    const coverage = coverageFor(inventory, observations);
    assert.equal(coverage.totalRoutes, 3);
    assert.equal(coverage.allRoutesRepresented, false);
    assert.equal(coverage.fullyVerified, false);
    assert.equal(coverage.publicModels, 2);
    assert.equal(coverage.fallbackRoutes, 1);
    assert.equal(coverage.routes[1].scan, "unverified");
    assert.equal(coverage.routes[2].scan, "not_scanned");
    assert.deepEqual(coverage.routes[0].unverifiedCostFields, [
        "completionTextTokens",
    ]);
    assert.equal(coverage.routes[0].variantsUnverified, true);
    const input = agentEvidence({ observations, findings: [], coverage });
    assert.equal(input.coverage.routes, undefined);
    assert.equal(input.coverage.providers.length, 2);
});

test("Catalog matches and rates preserve provider identity, units and unknown discounts", () => {
    const facts = catalogFacts("xai", {
        prompt_text_token_price: 20000,
        completion_text_token_price: 60000,
        cached_prompt_text_token_price: 5000,
    });
    assert.deepEqual(facts.observedRates, {
        promptTextTokens: 2e-6,
        completionTextTokens: 6e-6,
        promptCachedTokens: 5e-7,
    });
    assert.deepEqual(
        catalogFacts("deepinfra", {
            pricing: {
                type: "tokens",
                discount: 0.5,
                cents_per_input_token: 0.0001,
            },
        }).observedRates,
        {},
    );
    assert.equal(
        catalogFacts("deepinfra", {
            pricing: {
                type: "tokens",
                discount: null,
                cents_per_input_token: 0.0001,
            },
        }).observedRates.promptTextTokens,
        1e-6,
    );
    assert.equal(
        catalogFacts("ovhcloud", {
            pricing: { currency_unit: "USD", prompt: "0", completion: null },
        }).observedRates.promptTextTokens,
        0,
    );
    assert.equal(
        catalogFacts("openai", { shutdown_date: "2026-12-01" }).retirementDate,
        "2026-12-01",
    );
    assert.equal(
        catalogFacts("deepinfra", { deprecated: 1757622099 }).retirementDate,
        null,
    );
    assert.equal(
        matchCatalogModel(
            "openai",
            [{ id: "gpt-image-1.5" }],
            "openai/gpt-image-1.5",
        ),
        null,
    );
    assert.equal(
        matchCatalogModel(
            "xai",
            [
                { id: "m", aliases: ["a"] },
                { id: "m2", aliases: ["a"] },
            ],
            "a",
        ),
        null,
    );
    assert.deepEqual(
        catalogHeaders("https://api.openai.com.evil.example/v1/models", {
            OPENAI_API_KEY: "test",
        }),
        {},
    );
    assert.deepEqual(
        catalogHeaders("https://api.elevenlabs.io/v1/models", {
            ELEVENLABS_API_KEY: "test",
        }),
        { "xi-api-key": "test" },
    );
});
