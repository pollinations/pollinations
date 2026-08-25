export type UserBalance = {
    tierBalance: number;
    packBalance: number;
};

export type BalanceBucket = "tier" | "pack";

/**
 * The one wallet bucket a request pays from, fixed at authorize time for
 * every event of the request: paid-only work is always billed to the pack;
 * otherwise Quest Pollen when it covers the estimate, else the pack. With
 * nothing positive to draw from, an affordable estimate still lands on the
 * bucket that covers it (Quest Pollen first), so any shortfall the actual
 * price adds becomes Quest-Pollen debt rather than deeper pack debt.
 *
 * Returns null when no bucket covers the estimate. Paid-only stays strict:
 * the flag means "must hold paid balance", so the pack must cover the
 * estimate and be positive, and a zero-balance caller never gets a
 * paid-only model through on a zero estimate.
 */
export function selectWalletBucket(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): BalanceBucket | null {
    const threshold = Math.max(0, estimatedCost);
    if (isPaidOnly) {
        const { packBalance } = balances;
        return packBalance > 0 && packBalance >= threshold ? "pack" : null;
    }
    const { tierBalance, packBalance } = balances;
    if (tierBalance > 0 && tierBalance >= threshold) return "tier";
    if (packBalance > 0 && packBalance >= threshold) return "pack";
    if (tierBalance >= threshold) return "tier";
    if (packBalance >= threshold) return "pack";
    return null;
}

/** Preflight "can the caller afford this estimate" check, same rule as above. */
export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): boolean {
    return selectWalletBucket(balances, estimatedCost, isPaidOnly) !== null;
}
