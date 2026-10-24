import assert from "node:assert/strict";
import test from "node:test";
import { inferenceQuote } from "./pricing.mjs";

const model = {
    name: "openai/gpt-6.1-sol",
    pricing: {
        currency: "pollen",
        promptTextTokens: "0.000002",
        promptCachedTokens: "0.0000001",
        promptCacheWriteTokens: "0.0000025",
        promptImageTokens: "0.000002",
        completionTextTokens: "0.00001",
    },
    pricing_variants: [
        {
            name: "long_context",
            label: "Long context (>272K)",
            description:
                "More than 272,000 prompt tokens; the higher rates apply to the full request.",
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.000004",
                promptCachedTokens: "0.0000002",
                promptCacheWriteTokens: "0.000005",
                promptImageTokens: "0.000004",
                completionTextTokens: "0.000015",
            },
        },
    ],
};

test("verified GPT-6.1 Sol contract uses base rates through exactly 272000 tokens", () => {
    for (const prompt of [100, 272000]) {
        const quote = inferenceQuote(model, prompt, 6000);
        assert.deepEqual(quote.pricing, {
            promptTextTokens: 0.000002,
            completionTextTokens: 0.00001,
            promptCachedTokens: 0.0000001,
            promptCacheWriteTokens: 0.0000025,
        });
        assert.equal(quote.reserved, prompt * 0.0000025 + 6000 * 0.00001);
    }
});

test("long context reserves maximum public rates from 272001 tokens", () => {
    for (const prompt of [272001, 400000]) {
        const quote = inferenceQuote(model, prompt, 6000);
        assert.deepEqual(quote.pricing, {
            promptTextTokens: 0.000004,
            completionTextTokens: 0.000015,
            promptCachedTokens: 0.0000002,
            promptCacheWriteTokens: 0.000005,
        });
        assert.equal(quote.reserved, prompt * 0.000005 + 6000 * 0.000015);
    }
});

test("unexpected variant metadata or model identity keeps conservative rates", () => {
    const variant = model.pricing_variants[0];
    for (const candidate of [
        { ...model, name: "different-model" },
        { ...model, pricing_variants: [{ ...variant, name: "changed" }] },
        {
            ...model,
            pricing_variants: [
                { ...variant, description: "Changed threshold" },
            ],
        },
        { ...model, pricing_variants: [variant, variant] },
    ]) {
        const quote = inferenceQuote(candidate, 100, 6000);
        assert.equal(quote.pricing.promptTextTokens, 0.000004);
        assert.equal(quote.pricing.completionTextTokens, 0.000015);
        assert.equal(quote.reserved, 100 * 0.000005 + 6000 * 0.000015);
    }
});

test("absent optional cache prices conservatively inherit input", () => {
    const quote = inferenceQuote(
        {
            pricing: {
                promptTextTokens: "0.002",
                completionTextTokens: "0.01",
            },
        },
        100,
        5,
    );
    assert.equal(quote.reserved, 0.25);
    assert.equal(quote.pricing.promptCachedTokens, 0.002);
    assert.equal(quote.pricing.promptCacheWriteTokens, 0.002);
});

test("cache reads above other input rates violate the settlement contract", () => {
    assert.throws(
        () =>
            inferenceQuote(
                {
                    pricing: {
                        promptTextTokens: 0.002,
                        promptCachedTokens: 0.004,
                        completionTextTokens: 0.01,
                    },
                },
                100,
                5,
            ),
        /cache price/,
    );
});

test("negative, malformed, and missing rates fail before inference", () => {
    for (const field of [
        "promptTextTokens",
        "completionTextTokens",
        "promptCachedTokens",
        "promptCacheWriteTokens",
    ]) {
        for (const value of [
            -1,
            NaN,
            Infinity,
            null,
            "",
            " ",
            false,
            "unknown",
        ]) {
            assert.throws(
                () =>
                    inferenceQuote(
                        { pricing: { ...model.pricing, [field]: value } },
                        100,
                        5,
                    ),
                /prices/,
            );
        }
    }
    for (const field of ["promptTextTokens", "completionTextTokens"]) {
        assert.throws(
            () =>
                inferenceQuote(
                    { pricing: { ...model.pricing, [field]: undefined } },
                    100,
                    5,
                ),
            /prices/,
        );
    }
    assert.throws(
        () =>
            inferenceQuote(
                {
                    ...model,
                    pricing_variants: [
                        {
                            pricing: {
                                ...model.pricing,
                                completionTextTokens: -1,
                            },
                        },
                    ],
                },
                100,
                5,
            ),
        /prices/,
    );
    assert.throws(
        () => inferenceQuote({ ...model, pricing_variants: [{}] }, 100, 5),
        /prices/,
    );
});

test("unbounded adjustment charges are rejected even when advertised as free", () => {
    for (const price of ["0", "0.01"]) {
        assert.throws(
            () =>
                inferenceQuote(
                    {
                        ...model,
                        pricing_adjustments: [
                            {
                                name: "search",
                                kind: "tool",
                                price,
                                quantity: 1,
                                currency: "pollen",
                                unit: "invocation",
                            },
                        ],
                    },
                    100,
                    5,
                ),
            /adjustments cannot be bounded/,
        );
    }
    assert.doesNotThrow(() =>
        inferenceQuote({ ...model, pricing_adjustments: [] }, 100, 5),
    );
});

test("unknown billable dimensions and invalid bounds fail closed", () => {
    assert.throws(
        () =>
            inferenceQuote(
                { pricing: { ...model.pricing, request: 1 } },
                100,
                5,
            ),
        /dimension cannot be bounded/,
    );
    assert.throws(
        () =>
            inferenceQuote(
                { pricing: { ...model.pricing, currency: "USD" } },
                100,
                5,
            ),
        /currency/,
    );
    for (const [prompt, output] of [
        [-1, 5],
        [1.5, 5],
        [100, 0],
        [100, Infinity],
    ]) {
        assert.throws(() => inferenceQuote(model, prompt, output), /bounds/);
    }
});
