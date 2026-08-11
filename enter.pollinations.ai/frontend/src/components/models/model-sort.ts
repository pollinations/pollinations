import type { ModelSort } from "./model-search.ts";
import type { ModelPrice } from "./types.ts";

const compareKnownValues = (
    a: number | undefined,
    b: number | undefined,
    direction: "asc" | "desc",
): number => {
    if (a === undefined) return b === undefined ? 0 : 1;
    if (b === undefined) return -1;
    return direction === "asc" ? a - b : b - a;
};

const getAverageCost = (model: ModelPrice): number | undefined => {
    if (model.free) return 0;
    return model.realAvgCost && model.realAvgCost > 0
        ? model.realAvgCost
        : undefined;
};

export function sortModels(
    models: ModelPrice[],
    sort: ModelSort,
): ModelPrice[] {
    if (sort === "recommended") return models;

    return [...models].sort((a, b) => {
        switch (sort) {
            case "most-used":
                return compareKnownValues(
                    a.requestCount,
                    b.requestCount,
                    "desc",
                );
            case "newest":
                return compareKnownValues(a.addedDate, b.addedDate, "desc");
            case "price-low":
                return compareKnownValues(
                    getAverageCost(a),
                    getAverageCost(b),
                    "asc",
                );
            case "price-high":
                return compareKnownValues(
                    getAverageCost(a),
                    getAverageCost(b),
                    "desc",
                );
        }

        return 0;
    });
}
