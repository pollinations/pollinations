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

    // Key-level pollen type restriction takes precedence.
    if (keyPollenType === "quest") return balances.tierBalance > threshold;
    if (keyPollenType === "paid") return balances.packBalance > threshold;

    // Paid-only stays strict: the flag means "must hold paid balance", a
    // positive-balance requirement rather than a cost-coverage one. A paid-only
    // model is never free, so no zero-balance caller needs to get through.
    if (isPaidOnly) return balances.packBalance > threshold;
    // Cost coverage, so a zero-priced model is covered by a zero balance.
    return (
        balances.tierBalance >= threshold || balances.packBalance >= threshold
    );
}
