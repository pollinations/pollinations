import { describe, expect, it } from "vitest";
import {
    calculatePerPollen,
    calculatePerPollenValue,
} from "../frontend/src/components/models/calculations.ts";
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
    it("ranks a free model as unlimited generations per pollen", () => {
        const freeModel = model({ free: true });
        const freeValue = calculatePerPollenValue(freeModel);
        const paidValue = calculatePerPollenValue(model({ realAvgCost: 0.25 }));

        expect(freeValue).toBe(Number.POSITIVE_INFINITY);
        expect(freeValue).toBeGreaterThan(paidValue ?? 0);
        expect(calculatePerPollen(freeModel)).toBe("∞");
    });

    it("keeps missing usage data distinct from a free model", () => {
        expect(calculatePerPollenValue(model())).toBeUndefined();
        expect(calculatePerPollen(model())).toBe("—");
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
