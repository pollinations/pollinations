/**
 * Pollen billing precision policy.
 *
 * The smallest billable Pollen unit is 1e-8. Ledger debits, credits, and
 * analytics totals round to this precision so they agree exactly.
 */
export const POLLEN_BILLING_PRECISION = 8;

export function roundPollenLedgerAmount(amount: number): number {
    if (!Number.isFinite(amount)) {
        throw new RangeError("Pollen ledger amount must be finite");
    }
    const factor = 10 ** POLLEN_BILLING_PRECISION;
    const rounded = Math.round(amount * factor) / factor;
    // Collapse the `-0` that Math.round produces for sub-precision negatives
    // into `+0`. Ledger amounts are unsigned-equivalent at the boundary.
    return rounded === 0 ? 0 : rounded;
}

// Scale factor helper (e.g. 10^8 = 100,000,000n)
export const POLLEN_SCALE = 10n ** BigInt(POLLEN_BILLING_PRECISION);

/**
 * Converts standard Pollen (float/number) to micro-pollen (BigInt) at 8-decimal precision.
 * Uses Math.round to clean up any existing "dust" from old float calculations.
 */
export function toMicroPollen(floatAmount: number): bigint {
    if (typeof floatAmount !== "number" || isNaN(floatAmount)) {
        throw new Error("Invalid pollen amount provided");
    }
    const factor = 10 ** POLLEN_BILLING_PRECISION;
    return BigInt(Math.round(floatAmount * factor));
}

/**
 * Converts micro-pollen (BigInt) back to standard Pollen (number) for API/UI display
 */
export function toDisplayPollen(microAmount: bigint): number {
    const factor = 10 ** POLLEN_BILLING_PRECISION;
    return Number(microAmount) / factor;
}
