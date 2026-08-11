import { describe, expect, it } from "vitest";
import { sortModels } from "../frontend/src/components/models/model-sort.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

function model(name: string, overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name,
        type: "text",
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

describe("model sorting", () => {
    const models = [
        model("unknown"),
        model("free", { free: true, addedDate: 10, requestCount: 20 }),
        model("cheap", {
            realAvgCost: 0.1,
            addedDate: 30,
            requestCount: 10,
        }),
        model("expensive", {
            realAvgCost: 0.8,
            addedDate: 20,
            requestCount: 30,
        }),
    ];

    it("preserves catalog order for the recommended option", () => {
        expect(sortModels(models, "recommended")).toBe(models);
    });

    it("sorts by usage and newest first with missing values last", () => {
        expect(sortModels(models, "most-used").map(({ name }) => name)).toEqual(
            ["expensive", "free", "cheap", "unknown"],
        );
        expect(sortModels(models, "newest").map(({ name }) => name)).toEqual([
            "cheap",
            "expensive",
            "free",
            "unknown",
        ]);
    });

    it("sorts free and observed average generation costs", () => {
        expect(sortModels(models, "price-low").map(({ name }) => name)).toEqual(
            ["free", "cheap", "expensive", "unknown"],
        );
        expect(
            sortModels(models, "price-high").map(({ name }) => name),
        ).toEqual(["expensive", "cheap", "free", "unknown"]);
    });
});
