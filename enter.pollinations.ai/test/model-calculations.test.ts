import { describe, expect, it } from "vitest";
import { calculatePerPollen } from "../frontend/src/components/models/calculations.ts";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";
import {
    matchesModelQuery,
    parseModelQuery,
} from "../frontend/src/components/models/model-query.ts";
import { sortModels } from "../frontend/src/components/models/model-sort.ts";
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

    it.each([
        undefined,
        0,
        0.02,
    ])("does not mistake an agent's free wrapper for its run cost (%s)", (avgCost) => {
        const prices = getModelPricesFromCatalog(
            [
                {
                    name: "owner/agent",
                    category: "text",
                    agent: true,
                    community: true,
                    pricing: { currency: "pollen" },
                },
                {
                    name: "free-model",
                    category: "text",
                    pricing: { currency: "pollen" },
                },
            ],
            avgCost === undefined
                ? undefined
                : {
                      "owner/agent": { avgCost, requestCount: 3 },
                  },
        );
        const [agent, freeModel] = prices;

        expect(agent.free).toBe(false);
        expect(calculatePerPollen(agent)).toBe(avgCost ? "50" : "—");
        expect(matchesModelQuery(agent, parseModelQuery("access:free"))).toBe(
            false,
        );
        expect(freeModel.free).toBe(true);
        expect(calculatePerPollen(freeModel)).toBe("∞");
        expect(sortModels(prices, "price-low").map(({ name }) => name)).toEqual(
            ["free-model", "owner/agent"],
        );
        expect(
            sortModels(prices, "price-high").map(({ name }) => name),
        ).toEqual(
            avgCost
                ? ["owner/agent", "free-model"]
                : ["free-model", "owner/agent"],
        );
    });
});

it("does not promise a whole request when one costs more than a Pollen", () => {
    expect(calculatePerPollen(model({ realAvgCost: 2 }))).toBe("<1");
});

it("does not label a model with paid variants as wholly free", () => {
    const [priced] = getModelPricesFromCatalog([
        {
            name: "example/mixed-pricing",
            category: "video",
            pricing: { currency: "pollen" },
            pricing_variants: [
                {
                    name: "hd",
                    label: "HD",
                    description: "HD output",
                    pricing: {
                        currency: "pollen",
                        completionVideoSeconds: "0.1",
                    },
                },
            ],
        },
    ]);
    expect(priced.free).toBe(false);
    expect(calculatePerPollen(priced)).toBe("—");
});
