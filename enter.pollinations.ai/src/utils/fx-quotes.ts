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
 * quote's fee, take the mid-market reference_rate, and add our own estimate at
 * the 3% midpoint of Stripe's stated range — worst-case ~1% off the real charge
 * in either direction. Always labelled "≈"; the buyer sees Stripe's exact
 * number on the checkout page.
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

// Cold-start Adaptive Pricing buyer markup, used until we've observed a real
// purchase in a currency (see recordObservedMarkup). Stripe's real markup is a
// variable, unpublished 2-4% (and some currencies, e.g. INR, run hotter). We
// default to the top of the range so a never-seen currency errs slightly HIGH
// (buyer pays no more than shown) rather than low (an unpleasant surprise).
export const AP_FEE_ESTIMATE = 0.04;

// Smoothing factor for the per-currency markup EMA. Low enough to absorb the
// per-transaction 2-4% jitter, high enough to track real drift over ~dozens of
// sales. newEma = ALPHA * observed + (1 - ALPHA) * previous.
export const AP_MARKUP_EMA_ALPHA = 0.25;

export type LocalizedPackPrice = {
    /** Amount in the buyer's local currency (minor-unit rounded). */
    amount: number;
    /** Display string, e.g. "€61.38" or "¥11,388". */
    formatted: string;
};

export type LocalizedPrices = {
    /** Presentment currency (lowercase ISO), or null when not localizable. */
    currency: string | null;
    prices: Partial<Record<PollenPackKey, LocalizedPackPrice>>;
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
 * unit of the local currency (Stripe `rates[local].rate_details.reference_rate`);
 * `markup` is the Adaptive Pricing markup multiplier (e.g. 1.04), learned per
 * currency from real purchases or the cold-start default.
 */
export function localizeUsdAmount(
    usdAmount: number,
    midRate: number,
    currency: string,
    markup: number = 1 + AP_FEE_ESTIMATE,
): number {
    const local = (usdAmount / midRate) * markup;
    if (isZeroDecimalCurrency(currency)) return Math.round(local);
    return Math.round(local * 100) / 100;
}

/**
 * Recover the Adaptive Pricing markup multiplier from a completed purchase:
 * the buyer's effective rate (presentment ÷ settlement) over the mid-market
 * rate. Amounts are in Stripe minor units; USD settlement is always 2-decimal.
 */
export function computeObservedMarkup(
    presentmentAmountMinor: number,
    usdAmountMinor: number,
    referenceRate: number,
    presentmentCurrency: string,
): number | null {
    if (
        usdAmountMinor <= 0 ||
        presentmentAmountMinor <= 0 ||
        referenceRate <= 0
    ) {
        return null;
    }
    const localDecimals = isZeroDecimalCurrency(presentmentCurrency) ? 0 : 2;
    const presentmentMajor = presentmentAmountMinor / 10 ** localDecimals;
    const usdMajor = usdAmountMinor / 100;
    // effective local-per-USD ÷ mid local-per-USD (= 1 / referenceRate).
    return (presentmentMajor / usdMajor) * referenceRate;
}

/** EMA step; seeds to `observed` when there's no prior value. */
export function nextMarkupEma(
    previous: number | undefined,
    observed: number,
    alpha: number = AP_MARKUP_EMA_ALPHA,
): number {
    if (previous === undefined) return observed;
    return alpha * observed + (1 - alpha) * previous;
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
    markup: number = 1 + AP_FEE_ESTIMATE,
): Record<PollenPackKey, LocalizedPackPrice> {
    const prices = {} as Record<PollenPackKey, LocalizedPackPrice>;
    for (const pack of packs) {
        const amount = localizeUsdAmount(pack.priceUsd, rate, currency, markup);
        prices[pack.packKey] = {
            amount,
            formatted: formatLocalAmount(amount, currency),
        };
    }
    return prices;
}

// FX Quotes is preview-gated; pin the version that exposes it.
const FX_QUOTES_API_VERSION = "2025-03-31.preview";
export const FX_RATES_KV_KEY = "fx-quote:usd-mid-rates:v2";
// Refresh hourly to match the `hour` lock and keep the displayed estimate stable
// for a buyer across a session without hammering Stripe (one quote per hour total).
const FX_RATES_TTL_SECONDS = 3600;
// Per-currency learned AP markups. Durable knowledge (markups drift slowly), so
// a long TTL that self-heals if a currency stops selling.
export const AP_MARKUPS_KV_KEY = "fx-quote:ap-markups:v1";
const AP_MARKUPS_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

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
 * Read the cached rate map without ever fetching. Used on the webhook credit
 * path so markup recording never adds a Stripe round-trip; the slider endpoint
 * keeps the cache warm, so it's almost always present.
 */
async function peekCachedUsdRateMap(
    env: CloudflareBindings,
): Promise<RateMap | null> {
    return env.KV.get<RateMap>(FX_RATES_KV_KEY, "json");
}

/** Per-currency learned AP markup multipliers (e.g. `{ eur: 1.037 }`). */
export async function getApMarkups(env: CloudflareBindings): Promise<RateMap> {
    return (await env.KV.get<RateMap>(AP_MARKUPS_KV_KEY, "json")) ?? {};
}

/**
 * Learn the real AP markup for a currency from a completed purchase and fold it
 * into the per-currency EMA. Best-effort and side-effect-only: silently no-ops
 * for USD / unsupported currencies or when the mid-market rate isn't cached, so
 * it's safe to fire-and-forget via `waitUntil` off the credit path.
 */
export async function recordObservedMarkup(
    env: CloudflareBindings,
    presentmentCurrency: string,
    presentmentAmountMinor: number,
    usdAmountMinor: number,
): Promise<void> {
    const currency = presentmentCurrency.toLowerCase();
    if (!SUPPORTED_PRESENTMENT_CURRENCIES.includes(currency)) return;

    const rates = await peekCachedUsdRateMap(env);
    const referenceRate = rates?.[currency];
    if (!referenceRate) return;

    const observed = computeObservedMarkup(
        presentmentAmountMinor,
        usdAmountMinor,
        referenceRate,
        currency,
    );
    if (observed === null) return;

    const markups = await getApMarkups(env);
    markups[currency] = nextMarkupEma(markups[currency], observed);
    await env.KV.put(AP_MARKUPS_KV_KEY, JSON.stringify(markups), {
        expirationTtl: AP_MARKUPS_TTL_SECONDS,
    });
}

/**
 * Resolve localized pack prices for a buyer country. Returns
 * `{ currency: null, prices: {} }` whenever localization is unavailable
 * (unmapped country, missing rate) so callers fail open to USD display.
 * Uses the learned per-currency markup when available, else the cold default.
 */
export async function getLocalizedPrices(
    env: CloudflareBindings,
    country: string | null | undefined,
    packs: ReadonlyArray<PollenPack>,
): Promise<LocalizedPrices> {
    const currency = currencyForCountry(country);
    if (!currency) return { currency: null, prices: {} };

    const [rates, markups] = await Promise.all([
        getUsdRateMap(env),
        getApMarkups(env),
    ]);
    const rate = rates[currency];
    if (!rate || rate <= 0) return { currency: null, prices: {} };

    const markup = markups[currency] ?? 1 + AP_FEE_ESTIMATE;
    return {
        currency,
        prices: buildLocalizedPrices(packs, currency, rate, markup),
    };
}
