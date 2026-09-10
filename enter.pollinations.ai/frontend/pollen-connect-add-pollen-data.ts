import { POLLEN_PACKS } from "../../shared/pollen-packs";
export const addPollenAmounts: readonly number[] = [1, 2, 3, 4, 5, 10, 20];
export const defaultAddPollenAmount = 5;

// Preview arithmetic only. Real balances and payment confirmation remain server-owned.
export function addPollenPlan(
    balance: number,
    budget: number,
    amount: number,
    selectedPack?: number,
) {
    const resultingBudget = Math.max(0, budget + amount);
    const shortfall = amount > 0 ? Math.max(0, resultingBudget - balance) : 0;
    const pack =
        shortfall > 0
            ? (POLLEN_PACKS.find(
                  (pack) =>
                      pack.amountUsd === selectedPack &&
                      pack.amountUsd >= shortfall,
              ) ??
              [...POLLEN_PACKS]
                  .sort((a, b) => a.amountUsd - b.amountUsd)
                  .find((pack) => pack.amountUsd >= shortfall))
            : undefined;
    return { resultingBudget, shortfall, pack };
}
