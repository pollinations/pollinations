import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";

/** Show tiny balances at ledger precision and round larger amounts toward zero. */
export function formatUsd(pollen: number): string {
    const abs = Math.abs(pollen);
    if (abs > 0 && abs < 10 ** -POLLEN_BILLING_PRECISION) {
        return pollen > 0 ? "<$0.00000001" : "less than $0.00000001 below zero";
    }
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: abs >= 100_000 ? "compact" : "standard",
        maximumFractionDigits:
            abs >= 1 ? 2 : abs >= 0.0001 ? 4 : POLLEN_BILLING_PRECISION,
        roundingMode: "trunc",
    }).format(pollen);
}
