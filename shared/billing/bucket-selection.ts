export type UserBalance = {
    tierBalance: number;
    packBalance: number;
};

export type BalanceBucket = "tier" | "pack";

/**
 * Preflight "can the caller afford this estimate" check. This is intentionally
 * a different question from Enter's authoritative reservation: this one only
 * asks whether enough exists to let the request proceed before any mutation.
 *
 * The two therefore need not use identical thresholds. This preflight clamps
 * negative estimates to zero and accepts zero-cost coverage. The write path
 * skips non-positive charges entirely; for a positive actual charge, it uses
 * Quest Pollen when that bucket covers the charge, otherwise paid balance.
 */
export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): boolean {
    const threshold = Math.max(0, estimatedCost);
    // Paid-only stays strict for a zero estimate, but a positive estimate may
    // spend an exactly matching paid balance down to zero.
    if (isPaidOnly) {
        return balances.packBalance > 0 && balances.packBalance >= threshold;
    }
    // Cost coverage, so a zero-priced model is covered by a zero balance.
    return (
        balances.tierBalance >= threshold || balances.packBalance >= threshold
    );
}
