import { describe, expect, it } from "vitest";
import { calculatePerPollen } from "../frontend/src/components/models/calculations.ts";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

function model(overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name: "community/model",
        type: "text",
        community: true,
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

describe("model per-pollen calculations", () => {
    it("shows a free model as unlimited generations per pollen", () => {
        const freeModel = model({ free: true });

        expect(calculatePerPollen(freeModel)).toBe("∞");
        expect(calculatePerPollen(model({ realAvgCost: 0.25 }))).toBe("4");
    });

    it("keeps missing and zero usage data distinct from a free model", () => {
        expect(calculatePerPollen(model())).toBe("—");
        expect(calculatePerPollen(model({ realAvgCost: 0 }))).toBe("—");
    });

    it("prices an agent by what its run spent, not by its free listing", () => {
        // An agent charges no wrapper price, so the catalog lists it free, but
        // it spends the caller's balance on the models and tools it calls.
        // The measured run cost is the honest answer.
        expect(
            calculatePerPollen(model({ free: true, realAvgCost: 0.02 })),
        ).toBe("50");
    });

    it("identifies a zero-priced catalog model as free", () => {
        const [freeModel] = getModelPricesFromCatalog([
            {
                name: "community/free-model",
                category: "text",
                community: true,
                pricing: { currency: "pollen" },
            },
        ]);

        expect(freeModel?.free).toBe(true);
        expect(calculatePerPollen(freeModel)).toBe("∞");
    });
});

describe("model limit fields in catalog mapping", () => {
    it("maps context_length from the catalog to contextLength on ModelPrice", () => {
        const [m] = getModelPricesFromCatalog([
            {
                name: "text-model",
                category: "text",
                context_length: 128000,
                pricing: {
                    currency: "pollen",
                    promptTextTokens: "0.000001",
                },
            },
        ]);
        expect(m?.contextLength).toBe(128000);
    });

    it("maps video duration fields from the catalog to ModelPrice", () => {
        const [m] = getModelPricesFromCatalog([
            {
                name: "video-model",
                category: "video",
                min_duration: 4,
                max_duration: 8,
                pricing: {
                    currency: "pollen",
                    completionVideoSeconds: "0.05",
                },
            },
        ]);
        expect(m?.minDuration).toBe(4);
        expect(m?.maxDuration).toBe(8);
    });

    it("leaves limit fields undefined when the API omits them", () => {
        const [m] = getModelPricesFromCatalog([
            {
                name: "plain-model",
                category: "text",
                pricing: { currency: "pollen" },
            },
        ]);
        expect(m?.contextLength).toBeUndefined();
        expect(m?.minDuration).toBeUndefined();
        expect(m?.maxDuration).toBeUndefined();
    });
});
