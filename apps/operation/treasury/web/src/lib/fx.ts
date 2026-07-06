// Monthly average EUR→USD (ECB rates via frankfurter.dev, pulled 2026-07-06).
// Append one line when a new month starts — the only maintenance this needs.
export const FX_EUR_USD: Record<string, number> = {
    "2026-01": 1.1738,
    "2026-02": 1.1824,
    "2026-03": 1.1558,
    "2026-04": 1.1706,
    "2026-05": 1.1673,
    "2026-06": 1.1518,
    "2026-07": 1.1411,
};

export const FX_EUR_USD_FALLBACK = 1.15;

export function eurUsdRate(month: string): number {
    return FX_EUR_USD[month] ?? FX_EUR_USD_FALLBACK;
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
