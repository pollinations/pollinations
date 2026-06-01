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
    if (isPaidOnly) return balances.packBalance > threshold;
    return balances.tierBalance > threshold || balances.packBalance > threshold;
}

export function selectDeductionBucket(
    balances: UserBalance,
    amount: number,
    isPaidOnly = false,
): BalanceBucket {
    if (isPaidOnly) return "pack";
    if (balances.tierBalance >= amount) return "tier";
    if (balances.packBalance > 0) return "pack";
    return "tier";
}
