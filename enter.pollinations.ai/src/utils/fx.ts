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

export function parseEcbUsdRate(xml: string): number | null {
    const match = xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/i);
    if (!match) return null;
    const rate = Number.parseFloat(match[1]);
    return Number.isFinite(rate) ? rate : null;
}

export function usdToEurCents(usdAmount: number, usdPerEur: number): number {
    return Math.round((usdAmount / usdPerEur) * 100);
}

/**
 * USD-per-EUR mid-market rate from the live ECB daily feed. Throws if the
 * rate is unavailable — EUR pricing must fail loudly, never guess an amount.
 */
export async function getEurMidRate(): Promise<number> {
    const res = await fetch(ECB_DAILY_URL);
    if (!res.ok) {
        throw new Error(`ECB rate fetch failed: HTTP ${res.status}`);
    }
    const rate = parseEcbUsdRate(await res.text());
    if (rate == null) {
        throw new Error("ECB rate fetch failed: no USD rate in response");
    }
    return rate;
}
