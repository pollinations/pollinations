import type { PrivateForecastRule, StripeSalesRow } from "../types";

// Tinybird checks full-month coverage across all required Stripe accounts.
export function salesCoverage(rows: readonly StripeSalesRow[]) {
    if (!rows.length) return "Missing";
    return rows.every((row) => row.coverage_complete === 1)
        ? "Complete"
        : "Unverified";
}

// Both Sales and reconciliation consume the same queried financial coverage.
export function salesSourceIssues(
    rows: readonly StripeSalesRow[],
    month: string,
    now: Date,
) {
    const current = month === now.toISOString().slice(0, 7);
    const issues: { message: string; financial: boolean }[] = [];
    const missing = [
        ...new Set(
            rows.flatMap((row) =>
                (row.missing_accounts ?? "").split(", ").filter(Boolean),
            ),
        ),
    ];
    if (missing.length)
        issues.push({
            message: `Stripe financial exports are missing for account(s): ${missing.join(", ")}.`,
            financial: true,
        });
    if (rows.some((row) => (row.count_mismatches ?? 0) > 0))
        issues.push({
            message:
                "Stripe transaction count differs from its completed export. Re-run the financial sync.",
            financial: true,
        });
    if (!current && !issues.length && salesCoverage(rows) !== "Complete")
        issues.push({
            message: !rows.length
                ? "Calendar-month sales are missing."
                : "Calendar-month sales coverage is not confirmed complete.",
            financial: true,
        });
    const asUtc = (value: string) =>
        Date.parse(value.replace(" ", "T").replace(/Z?$/, "Z"));
    if (
        current &&
        rows.some(
            (row) =>
                !row.coverage_end || !Number.isFinite(asUtc(row.coverage_end)),
        )
    )
        issues.push({
            message:
                "Stripe financial export boundary is missing. Confirm the current month's coverage.",
            financial: true,
        });
    if (
        current &&
        rows.some(
            (row) =>
                row.coverage_end &&
                now.getTime() - asUtc(row.coverage_end) > 48 * 3600_000,
        )
    )
        issues.push({
            message:
                "Stripe financial coverage is more than two days behind. Refresh the current month.",
            financial: true,
        });
    const unmatched = rows.reduce(
        (sum, row) => sum + (row.enter_unmatched_payments ?? 0),
        0,
    );
    if (!current && unmatched)
        issues.push({
            message: `${unmatched} recorded Pollen payment(s) have no matching Enter charge event. Financial amounts are included; check Enter event coverage.`,
            financial: false,
        });
    return issues;
}

// A sales stop ends projections, not coverage for trailing Stripe activity.
export function salesForecastRows(
    latest: readonly StripeSalesRow[],
    month: string,
    now: Date,
    stoppedFrom: PrivateForecastRule["salesStoppedFrom"] = {},
): StripeSalesRow[] {
    const today = now.toISOString().slice(0, 10);
    const stopped = (row: StripeSalesRow) => {
        const end = stoppedFrom[row.revenue_stream];
        return (
            !!end &&
            (month > end.slice(0, 7) ||
                (month === end.slice(0, 7) && today >= end))
        );
    };
    return latest.filter((row) => !stopped(row));
}
