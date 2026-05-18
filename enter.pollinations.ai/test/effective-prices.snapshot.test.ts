import { expect, test } from "vitest";
import {
    getCostDefinition,
    getModels,
    getPriceDefinition,
} from "../../shared/registry/registry.ts";

const SNAPSHOT_NUMBER_PRECISION = 15;

function normalizeSnapshotValue(value: unknown): unknown {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value === 0) return value;
        return Number(value.toPrecision(SNAPSHOT_NUMBER_PRECISION));
    }
    if (Array.isArray(value)) {
        return value.map(normalizeSnapshotValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [
                key,
                normalizeSnapshotValue(nestedValue),
            ]),
        );
    }
    return value;
}

// Locks the current effective cost and price for every model in the registry.
// Any change to a rate (cost, priceMultiplier, or the paidOnly default) shifts
// the snapshot — the reviewer sees the diff explicitly. To intentionally change
// a rate, update the model and run `vitest --update`.
test("effective cost and price per model — snapshot", () => {
    const snapshot = Object.fromEntries(
        getModels()
            .sort()
            .map((m) => [
                m,
                {
                    cost: getCostDefinition(m),
                    price: getPriceDefinition(m),
                },
            ]),
    );
    // Keep IEEE-754 noise out of the review artifact without rounding production
    // registry rates just to make the snapshot prettier.
    expect(normalizeSnapshotValue(snapshot)).toMatchSnapshot();
});
