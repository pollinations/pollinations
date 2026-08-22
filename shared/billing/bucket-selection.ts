export type UserBalance = {
    tierBalance: number;
    packBalance: number;
};

export type BalanceBucket = "tier" | "pack";

export type KeyPollenType = "quest" | "paid";

export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
    keyPollenType?: KeyPollenType | null,
): boolean {
    const threshold = Math.max(0, estimatedCost);

    // paidOnly stays strict: the flag means "must hold paid balance", a
    // positive-balance requirement rather than a cost-coverage one. A paid-only
    // model is never free, so no zero-balance caller needs to get through.
    // paidOnly takes precedence over keyPollenType — you can't route a
    // paid-only model through the quest bucket.
    if (isPaidOnly) return balances.packBalance > threshold;

    // Key-level pollen type restriction (only applies to non-paidOnly models).
    if (keyPollenType === "quest") return balances.tierBalance >= threshold;
    if (keyPollenType === "paid") return balances.packBalance >= threshold;

    // Cost coverage, so a zero-priced model is covered by a zero balance.
    return (
        balances.tierBalance >= threshold || balances.packBalance >= threshold
    );
}
