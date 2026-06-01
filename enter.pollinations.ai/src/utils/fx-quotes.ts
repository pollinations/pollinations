import type { PollenPack, PollenPackKey } from "@shared/pollen-packs.ts";

/**
 * Localized pack pricing via Stripe's FX Quotes API.
 *
 * Goal: show the buyer an honest local-currency estimate ("≈ €61") on the
 * pollen slider BEFORE redirect, while checkout itself stays USD-native and
 * lets Stripe Adaptive Pricing localize the real charge.
 *
 * Why FX Quotes: it gives us Stripe's own ECB mid-market rate
 * (`rate_details.reference_rate`) — the exact base Adaptive Pricing converts
 * from at checkout — server-side, with no third-party FX feed to drift.
 *
 * The fee, though, can't be read ahead of time. AP charges the buyer a
 * variable, unpublished 2-4% markup ("determined by Stripe... to increase
 * conversion"); the FX Quote's own `fx_fee_rate` is a different, lower (2%)
 * settlement fee that does NOT match AP's buyer-facing markup. So we ignore the
 * quote's fee, take the mid-market reference_rate, and add a conservative fixed
 * 4% estimate. Always labelled "≈"; the buyer sees Stripe's exact number on the
 * checkout page.
 *
 * Rate semantics (verified against the live API): with
 * `to_currency=usd` + `from_currencies=[local]`,
 * `rates[local].rate_details.reference_rate` is the mid-market USD value of 1
 * unit of the local currency. Buyer estimate:
 * `(usdAmount / reference_rate) * (1 + AP_FEE_ESTIMATE)`.
 */

// Curated country → presentment-currency map for major markets where Adaptive
// Pricing localizes. Anything unmapped (incl. US) falls back to USD display —
// the buyer still gets correct AP pricing at Stripe regardless.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
    // Eurozone
    DE: "eur",
    FR: "eur",
    ES: "eur",
    IT: "eur",
    NL: "eur",
    BE: "eur",
    AT: "eur",
    PT: "eur",
    IE: "eur",
    LU: "eur",
    GR: "eur",
    CY: "eur",
    MT: "eur",
    SI: "eur",
    SK: "eur",
    EE: "eur",
    LV: "eur",
    LT: "eur",
    FI: "eur",
    // Other majors
    GB: "gbp",
    BR: "brl",
    IN: "inr",
    JP: "jpy",
    CA: "cad",
    AU: "aud",
    NZ: "nzd",
    CH: "chf",
    SE: "sek",
    NO: "nok",
    DK: "dkk",
    PL: "pln",
    MX: "mxn",
    SG: "sgd",
    HK: "hkd",
    KR: "krw",
    AE: "aed",
    ZA: "zar",
};

/**
 * Unique presentment currencies fetched in a single FX quote. A country mapped
 * to a currency absent here would always fall back, so the test asserts parity.
 */
export const SUPPORTED_PRESENTMENT_CURRENCIES: ReadonlyArray<string> = [
    ...new Set(Object.values(COUNTRY_TO_CURRENCY)),
];

// Currencies Stripe treats as zero-decimal (amount is whole units, no cents).
const ZERO_DECIMAL_CURRENCIES = new Set(["jpy", "krw"]);

// Conservative Adaptive Pricing buyer markup estimate. Stripe's real markup is
// variable and unpublished, so the UI always labels this value as approximate.
export const AP_FEE_ESTIMATE = 0.04;

export type LocalizedPrices = {
    /** Presentment currency (lowercase ISO), or null when not localizable. */
    currency: string | null;
    /** Display strings keyed by pack, e.g. `{ p10: "€8.95" }`. */
    prices: Partial<Record<PollenPackKey, string>>;
};

export function currencyForCountry(
    country: string | null | undefined,
): string | null {
    if (!country) return null;
    return COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? null;
}

export function isZeroDecimalCurrency(currency: string): boolean {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
}

/**
 * Estimate the buyer's local price. `midRate` is the mid-market USD value of 1
 * unit of the local currency (Stripe `rates[local].rate_details.reference_rate`).
 */
export function localizeUsdAmount(
    usdAmount: number,
    midRate: number,
    currency: string,
): number {
    const local = (usdAmount / midRate) * (1 + AP_FEE_ESTIMATE);
    if (isZeroDecimalCurrency(currency)) return Math.round(local);
    return Math.round(local * 100) / 100;
}

export function formatLocalAmount(amount: number, currency: string): string {
    const zeroDecimal = isZeroDecimalCurrency(currency);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: zeroDecimal ? 0 : 2,
        maximumFractionDigits: zeroDecimal ? 0 : 2,
    }).format(amount);
}

export function buildLocalizedPrices(
    packs: ReadonlyArray<PollenPack>,
    currency: string,
    rate: number,
): Record<PollenPackKey, string> {
    const prices = {} as Record<PollenPackKey, string>;
    for (const pack of packs) {
        const amount = localizeUsdAmount(pack.amountUsd, rate, currency);
        prices[pack.packKey] = formatLocalAmount(amount, currency);
    }
    return prices;
}

// FX Quotes is preview-gated; pin the version that exposes it.
const FX_QUOTES_API_VERSION = "2025-03-31.preview";
export const FX_RATES_KV_KEY = "fx-quote:usd-mid-rates:v2";
// Refresh hourly to match the `hour` lock and keep the displayed estimate stable
// for a buyer across a session without hammering Stripe (one quote per hour total).
const FX_RATES_TTL_SECONDS = 3600;

type RateMap = Record<string, number>;

/**
 * Fetch one FX quote covering every supported presentment currency and return
 * `{ currency: reference_rate }` (mid-market USD value of 1 local unit; the AP
 * markup is added later in `localizeUsdAmount`). Uses a raw request so we are
 * not coupled to the SDK's pinned API version.
 */
export async function fetchUsdRateMap(secretKey: string): Promise<RateMap> {
    const body = new URLSearchParams();
    body.set("to_currency", "usd");
    body.set("lock_duration", "hour");
    body.set("usage[type]", "payment");
    for (const currency of SUPPORTED_PRESENTMENT_CURRENCIES) {
        body.append("from_currencies[]", currency);
    }

    const response = await fetch("https://api.stripe.com/v1/fx_quotes", {
        method: "POST",
        headers: {
            Authorization: `Basic ${btoa(`${secretKey}:`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Version": FX_QUOTES_API_VERSION,
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`FX quote request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
        rates?: Record<string, { rate_details?: { reference_rate?: number } }>;
    };
    const rates: RateMap = {};
    for (const [currency, detail] of Object.entries(data.rates ?? {})) {
        const referenceRate = detail.rate_details?.reference_rate;
        if (typeof referenceRate === "number") {
            rates[currency] = referenceRate;
        }
    }
    return rates;
}

/**
 * KV-cached rate map. Returns the cached map when warm, otherwise fetches a
 * fresh quote and caches it for an hour.
 */
export async function getUsdRateMap(env: CloudflareBindings): Promise<RateMap> {
    const cached = await env.KV.get<RateMap>(FX_RATES_KV_KEY, "json");
    if (cached) return cached;

    const rates = await fetchUsdRateMap(env.STRIPE_SECRET_KEY);
    await env.KV.put(FX_RATES_KV_KEY, JSON.stringify(rates), {
        expirationTtl: FX_RATES_TTL_SECONDS,
    });
    return rates;
}

/**
 * Resolve localized pack prices for a buyer country. Returns
 * `{ currency: null, prices: {} }` whenever localization is unavailable
 * (unmapped country, missing rate) so callers fail open to USD display.
 * Uses a fixed 4% Adaptive Pricing fee estimate on top of Stripe's mid-market
 * reference rate.
 */
export async function getLocalizedPrices(
    env: CloudflareBindings,
    country: string | null | undefined,
    packs: ReadonlyArray<PollenPack>,
): Promise<LocalizedPrices> {
    const currency = currencyForCountry(country);
    if (!currency) return { currency: null, prices: {} };

    const rates = await getUsdRateMap(env);
    const rate = rates[currency];
    if (!rate || rate <= 0) return { currency: null, prices: {} };

    return {
        currency,
        prices: buildLocalizedPrices(packs, currency, rate),
    };
}
