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
const getObservedCost = (model: ModelPrice): number | undefined => {
    if (model.realAvgCost && model.realAvgCost > 0) return model.realAvgCost;
    return model.free ? 0 : undefined;
};

const getTitle = (model: ModelPrice): string => model.displayName ?? model.name;

const compareText = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: "base" });

const compareAuthors = (
    a: ModelPrice,
    b: ModelPrice,
    direction: "asc" | "desc",
): number => {
    if (!a.author) return b.author ? 1 : compareText(getTitle(a), getTitle(b));
    if (!b.author) return -1;
    const authorOrder = compareText(a.author, b.author);
    return (
        (direction === "asc" ? authorOrder : -authorOrder) ||
        compareText(getTitle(a), getTitle(b))
    );
};

export function sortModels(
    models: ModelPrice[],
    sort: ModelSort,
): ModelPrice[] {
    return [...models].sort((a, b) => {
        switch (sort) {
            case "popular":
                return compareKnownValues(a.users7d, b.users7d, "desc");
            case "newest":
                return compareKnownValues(a.addedDate, b.addedDate, "desc");
            case "price-low":
                return compareKnownValues(
                    getObservedCost(a),
                    getObservedCost(b),
                    "asc",
                );
            case "price-high":
                return compareKnownValues(
                    getObservedCost(a),
                    getObservedCost(b),
                    "desc",
                );
            case "title":
                return compareText(getTitle(a), getTitle(b));
            case "title-desc":
                return compareText(getTitle(b), getTitle(a));
            case "author":
                return compareAuthors(a, b, "asc");
            case "author-desc":
                return compareAuthors(a, b, "desc");
        }

        return 0;
    });
}
