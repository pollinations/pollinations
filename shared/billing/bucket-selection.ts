export type UserBalance = {
    tierBalance: number;
    packBalance: number;
};

export type BalanceBucket = "tier" | "pack";

export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): boolean {
    const threshold = Math.max(0, estimatedCost);
    // Paid-only stays strict: the flag means "must hold paid balance", a
    // positive-balance requirement rather than a cost-coverage one. A paid-only
    // model is never free, so no zero-balance caller needs to get through.
    if (isPaidOnly) return balances.packBalance > threshold;
    // Cost coverage, so a zero-priced model is covered by a zero balance.
    return (
        balances.tierBalance >= threshold || balances.packBalance >= threshold
    );
}
