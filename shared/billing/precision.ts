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
