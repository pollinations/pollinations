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
