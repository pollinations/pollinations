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

// Same order as calculatePerPollen: a measured cost beats a declared free
// price, so an agent sorts by what its run actually spends, not as free.
const getAverageCost = (model: ModelPrice): number | undefined => {
    if (model.realAvgCost && model.realAvgCost > 0) return model.realAvgCost;
    return model.free ? 0 : undefined;
};

const getTitle = (model: ModelPrice): string => model.displayName ?? model.name;

const compareText = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: "base" });

const compareBrands = (a: ModelPrice, b: ModelPrice): number => {
    if (!a.brand) return b.brand ? 1 : compareText(getTitle(a), getTitle(b));
    if (!b.brand) return -1;
    return (
        compareText(a.brand, b.brand) || compareText(getTitle(a), getTitle(b))
    );
};

export function sortModels(
    models: ModelPrice[],
    sort: ModelSort,
): ModelPrice[] {
    return [...models].sort((a, b) => {
        switch (sort) {
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
            case "title":
                return compareText(getTitle(a), getTitle(b));
            case "brand":
                return compareBrands(a, b);
        }

        return 0;
    });
}
