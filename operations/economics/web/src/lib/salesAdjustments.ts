import type { StripeSalesRow } from "../types";

export const FRAUD_COMPONENTS = [
    "refunds",
    "reversals",
    "stripe_fees",
] as const;

// Classification only: actual sales and deductions are never rewritten.
export function salesFraudAdjustment(sale: StripeSalesRow) {
    if (!sale.fraud_transactions || sale.coverage_complete !== 1) return null;
    const adjustment = {
        refunds: sale.fraud_refunds ?? NaN,
        reversals: sale.fraud_reversals ?? NaN,
        stripe_fees: sale.fraud_fees ?? NaN,
        evidence: sale.fraud_evidence ?? [],
    };
    if (!adjustment.evidence.length) return null;
    if (
        FRAUD_COMPONENTS.some(
            (key) =>
                !Number.isFinite(adjustment[key]) ||
                adjustment[key] < 0 ||
                adjustment[key] > sale[key] + 0.001,
        )
    )
        return null;
    return {
        ...adjustment,
        total: FRAUD_COMPONENTS.reduce((sum, key) => sum + adjustment[key], 0),
    };
}
