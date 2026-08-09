import {
    getModelPricesFromCatalog,
    parseModelCatalogResponse,
} from "@frontend/components/models/model-catalog.ts";
import { describe, expect, it } from "vitest";

describe("parseModelCatalogResponse", () => {
    it("returns the array when entries have identifiable models", () => {
        const data = [
            { name: "openai/gpt-5.4-nano" },
            { id: "black-forest-labs/FLUX.1-schnell" },
        ];

        expect(parseModelCatalogResponse(data)).toEqual(data);
    });

    it("throws on a non-array response", () => {
        expect(() => parseModelCatalogResponse({ models: [] })).toThrow();
        expect(() => parseModelCatalogResponse(null)).toThrow();
    });

    it("throws on an empty array", () => {
        expect(() => parseModelCatalogResponse([])).toThrow();
    });

    it("throws when every entry lacks a name and id", () => {
        expect(() =>
            parseModelCatalogResponse([{ title: "Mystery" }, {}]),
        ).toThrow();
    });
});

it("carries arbitrary public pricing variants and adjustments into the UI", () => {
    const [model] = getModelPricesFromCatalog([
        {
            name: "any-model",
            category: "text",
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.000001",
            },
            pricing_variants: [
                {
                    name: "alternate",
                    label: "Alternate",
                    description: "Provider-selected alternate pricing",
                    pricing: {
                        currency: "pollen",
                        promptTextTokens: "0.000002",
                    },
                },
            ],
            pricing_default_label: "Standard context",
            pricing_adjustments: [
                {
                    name: "provider.adjustment.v1",
                    label: "Search",
                    kind: "search_request",
                    price: "12",
                    currency: "pollen",
                    quantity: 1_000,
                    unit: "requests",
                    option: {
                        group: "search_context",
                        value: "high",
                        label: "High search context",
                    },
                },
            ],
        },
    ]);

    expect(model).toMatchObject({
        name: "any-model",
        priceDefaultLabel: "Standard context",
        priceVariants: [
            {
                name: "alternate",
                label: "Alternate",
                prices: [{ direction: "input", price: "2.0", unit: "token" }],
            },
        ],
        priceAdjustments: [
            {
                name: "provider.adjustment.v1",
                label: "Search",
                price: "12",
                quantity: 1_000,
                unit: "requests",
            },
        ],
    });
});
