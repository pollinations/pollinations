export type UserBalance = {
    rewardBalance: number;
    paidBalance: number;
};

export type BalanceBucket = "reward" | "paid";

export type RawMeterSlug = "v1:meter:tier" | "v1:meter:pack";
export type RawLocalMeterId = "local:tier" | "local:pack";

export const BALANCE_BUCKET_TO_RAW_METER_SLUG = {
    reward: "v1:meter:tier",
    paid: "v1:meter:pack",
} as const satisfies Record<BalanceBucket, RawMeterSlug>;

export const BALANCE_BUCKET_TO_RAW_LOCAL_METER_ID = {
    reward: "local:tier",
    paid: "local:pack",
} as const satisfies Record<BalanceBucket, RawLocalMeterId>;

export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): boolean {
    const threshold = Math.max(0, estimatedCost);
    if (isPaidOnly) return balances.paidBalance > threshold;
    return (
        balances.rewardBalance > threshold || balances.paidBalance > threshold
    );
}

export function selectDeductionBucket(
    balances: UserBalance,
    amount: number,
    isPaidOnly = false,
): BalanceBucket {
    if (isPaidOnly) return "paid";
    if (balances.rewardBalance >= amount) return "reward";
    if (balances.paidBalance > 0) return "paid";
    return "reward";
}
