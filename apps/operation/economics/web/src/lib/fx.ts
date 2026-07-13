import type { Data } from "../types";

// Monthly average EUR→USD (ECB rates via frankfurter.dev, pulled 2026-07-06;
// 2025 backfill pulled 2026-07-13). Append one line when a new month starts —
// the only maintenance this needs. 2025 months are needed because the credit
// and prepaid-coverage lenses read pre-window rows.
const FX_EUR_USD: Record<string, number> = {
    "2025-01": 1.0354,
    "2025-02": 1.0413,
    "2025-03": 1.0807,
    "2025-04": 1.1214,
    "2025-05": 1.1278,
    "2025-06": 1.1516,
    "2025-07": 1.1677,
    "2025-08": 1.1631,
    "2025-09": 1.1732,
    "2025-10": 1.163,
    "2025-11": 1.156,
    "2025-12": 1.1709,
    "2026-01": 1.1738,
    "2026-02": 1.1824,
    "2026-03": 1.1558,
    "2026-04": 1.1706,
    "2026-05": 1.1673,
    "2026-06": 1.1518,
    "2026-07": 1.1411,
};

const LATEST_FX_MONTH = Object.keys(FX_EUR_USD).sort().at(-1) as string;

// A past month with no table rate is a missing append — throw so it surfaces
// instead of bending every EUR margin. Future months cannot have a published
// rate yet, so forecasts convert at the latest known rate; those months are
// listed per-month on the Data Quality tab via fxEstimatedMonths.
export function eurUsdRate(month: string): number {
    const rate = FX_EUR_USD[month];
    if (rate != null) return rate;
    if (month > LATEST_FX_MONTH) return FX_EUR_USD[LATEST_FX_MONTH];
    throw new Error(
        `Missing EUR→USD rate for ${month} — append it to FX_EUR_USD in lib/fx.ts`,
    );
}

// Months with EUR rows converting at the estimated (latest known) rate.
export function fxEstimatedMonths(data: Data): string[] {
    const months = new Set<string>();
    const check = (currency: string, period: string) => {
        if (currency.toUpperCase() !== "EUR") return;
        const month = period.slice(0, 7);
        if (FX_EUR_USD[month] == null) months.add(month);
    };
    for (const row of data.opTransactions ?? []) check(row.currency, row.date);
    for (const row of data.opCloud ?? []) check(row.currency, row.start);
    for (const row of data.opPollen ?? []) check(row.currency, row.month);
    for (const row of data.opRunway ?? []) check(row.currency, row.date);
    return [...months].sort();
}

// period may be "YYYY-MM" or a full "YYYY-MM-DD" date; only the month is used.
// Pollen is priced 1:1 with USD. A blank currency only ever accompanies a 0
// amount (the missing leg of a transaction).
export function toUsd(
    amount: number,
    currency: string,
    period: string,
): number {
    switch (currency.toUpperCase()) {
        case "EUR":
            return amount * eurUsdRate(period.slice(0, 7));
        case "USD":
        case "POLLEN":
        case "":
            return amount;
        default:
            throw new Error(`Unknown currency: ${currency}`);
    }
}
