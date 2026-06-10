/**
 * EUR pricing — single source of truth.
 *
 * ECB publishes daily euro reference rates as XML. With EUR as the base,
 * the USD line is USD-per-1-EUR (~1.155). To price a USD pack in EUR:
 *   eurCents = round((usdAmount / usdPerEur) * 100)   // exact mid-market, no margin
 *
 * Shares no code with #11348's fx-quotes.ts (that one is Stripe FX Quotes +
 * AP-markup, for `≈` display only).
 */

export const ECB_DAILY_URL =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

// Plausible EUR/USD band — rejects parse garbage (e.g. 115.5 or 0.0115) before
// it can reach unit_amount or poison the cache.
export const FX_RATE_MIN = 0.9;
export const FX_RATE_MAX = 1.5;

// Cold-cache + outage fallback. Set from the live ECB rate at deploy time
// (~1.155 as of 2026-06); only used when both fresh fetch and last-known-good
// are unavailable. Must stay inside [FX_RATE_MIN, FX_RATE_MAX].
export const EUR_USD_FLOOR = 1.15;

export function parseEcbUsdRate(xml: string): number | null {
    const match = xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/i);
    if (!match) return null;
    const rate = Number.parseFloat(match[1]);
    return Number.isFinite(rate) ? rate : null;
}

export function isPlausibleRate(rate: number): boolean {
    return Number.isFinite(rate) && rate >= FX_RATE_MIN && rate <= FX_RATE_MAX;
}

export function usdToEurCents(usdAmount: number, usdPerEur: number): number {
    return Math.round((usdAmount / usdPerEur) * 100);
}
