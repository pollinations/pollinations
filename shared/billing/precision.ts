/**
 * Pollen billing precision policy.
 *
 * The smallest billable Pollen unit is 1e-8. Every amount that lands on the
 * user balance ledger — both debits (payer charges) and credits (BYOP dev
 * markup) — is rounded to this precision so the on-disk balance and the
 * downstream analytics/event totals agree to the same precision.
 *
 * Per-usage-type price breakdowns inside `UsagePrice` are kept unrounded; they
 * are internal accounting, not ledger amounts. Only the final charge / credit
 * applied to a balance row is rounded here.
 */
export const POLLEN_BILLING_PRECISION = 8;

export function roundPollenLedgerAmount(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    const factor = 10 ** POLLEN_BILLING_PRECISION;
    return Math.round(amount * factor) / factor;
}
