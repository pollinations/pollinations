export type UserBalance = {
    tierBalance: number;
    packBalance: number;
};

export type BalanceBucket = "tier" | "pack";

/**
 * Preflight "can the caller afford this estimate" check. This is intentionally
 * a different question from the authoritative bucket ladder in
 * `atomicDeductUserBalance`: that function chooses *which* bucket to write to
 * when money actually moves; this one only asks whether *enough exists* to let
 * the request proceed before any mutation.
 *
 * The two therefore need not use identical thresholds. This preflight clamps
 * negative estimates to zero, but every request still requires a positive
 * balance in at least one bucket. The write path skips non-positive charges
 * entirely; for a positive actual charge, it uses
 * Quest Pollen when that bucket covers the charge, otherwise any positive paid
 * balance, and finally Quest Pollen debt when the paid balance is non-positive.
 */
export function canCoverEstimatedCharge(
    balances: UserBalance,
    estimatedCost: number,
    isPaidOnly = false,
): boolean {
    const hasPositiveBalance =
        balances.tierBalance > 0 || balances.packBalance > 0;
    if (!hasPositiveBalance) return false;

    const threshold = Math.max(0, estimatedCost);
    // Paid-only stays strict: the flag means "must hold paid balance", a
    // positive-balance requirement rather than a cost-coverage one. A paid-only
    // model is never free, so no zero-balance caller needs to get through.
    if (isPaidOnly) return balances.packBalance > threshold;
    // Once the wallet has a positive bucket, compare each bucket to the cost.
    return (
        balances.tierBalance >= threshold || balances.packBalance >= threshold
    );
}
