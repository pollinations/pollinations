import type { Data, StripeSalesRow } from "../types";

export const FRAUD_COMPONENTS = [
    "refunds",
    "reversals",
    "stripe_fees",
] as const;

// Classification only: actual sales and deductions are never rewritten.
export function salesFraudAdjustment(data: Data, sale: StripeSalesRow) {
    const matches = (data.privateConfig?.salesAdjustments ?? []).filter(
        (row) =>
            row.month === sale.month &&
            row.revenue_stream === sale.revenue_stream &&
            row.currency === sale.currency,
    );
    if (matches.length !== 1 || sale.coverage_complete !== 1) return null;
    const adjustment = matches[0];
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
