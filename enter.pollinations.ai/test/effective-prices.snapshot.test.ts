import { expect, test } from "vitest";
import {
    getCostDefinition,
    getModels,
    getPriceDefinition,
} from "../../shared/registry/registry.ts";

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
    expect(snapshot).toMatchSnapshot();
});
