import type { StripeSalesRow } from "../types";

// Tinybird checks full-month coverage across all required Stripe accounts.
export function salesCoverage(rows: readonly StripeSalesRow[]) {
    if (!rows.length) return "Missing";
    return rows.every((row) => row.coverage_complete === 1)
        ? "Complete"
        : "Unverified";
}
