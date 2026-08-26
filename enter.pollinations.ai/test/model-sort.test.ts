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
        model("free-but-measured", {
            free: true,
            addedDate: 10,
            realAvgCost: 99,
        }),
        model("cheap", {
            realAvgCost: 0.1,
            addedDate: 30,
        }),
        model("expensive", {
            realAvgCost: 0.8,
            addedDate: 20,
        }),
    ];

    it("sorts newest first with missing values last", () => {
        expect(sortModels(models, "newest").map(({ name }) => name)).toEqual([
            "cheap",
            "expensive",
            "free-but-measured",
            "unknown",
        ]);
        expect(sortModels(models, "oldest").map(({ name }) => name)).toEqual([
            "free-but-measured",
            "expensive",
            "cheap",
            "unknown",
        ]);

        const tiedModels = [
            model("first", { addedDate: 10 }),
            model("second", { addedDate: 10 }),
        ];
        expect(
            sortModels(tiedModels, "newest").map(({ name }) => name),
        ).toEqual(["first", "second"]);
    });

    it("sorts free and observed generation costs", () => {
        expect(sortModels(models, "price-low").map(({ name }) => name)).toEqual(
            ["cheap", "expensive", "free-but-measured", "unknown"],
        );
        expect(
            sortModels(models, "price-high").map(({ name }) => name),
        ).toEqual(["free-but-measured", "expensive", "cheap", "unknown"]);
    });

    it("sorts by display title or groups by author and then title", () => {
        const namedModels = [
            model("zeta", { displayName: "Zulu", author: "openai" }),
            model("alpha", { displayName: "alpha", author: "OpenAI" }),
            model("beta", { displayName: "Beta", author: "Anthropic" }),
            model("orphan", { displayName: "Orphan" }),
        ];

        expect(
            sortModels(namedModels, "title").map(({ name }) => name),
        ).toEqual(["alpha", "beta", "orphan", "zeta"]);
        expect(
            sortModels(namedModels, "title-desc").map(({ name }) => name),
        ).toEqual(["zeta", "orphan", "beta", "alpha"]);
        expect(
            sortModels(namedModels, "author").map(({ name }) => name),
        ).toEqual(["beta", "alpha", "zeta", "orphan"]);
        expect(
            sortModels(namedModels, "author-desc").map(({ name }) => name),
        ).toEqual(["alpha", "zeta", "beta", "orphan"]);
    });
});
