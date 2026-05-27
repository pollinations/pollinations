export type CohortId =
    | "USD"
    | "BR"
    | "APAC_ALIPAY"
    | "EU_CORE"
    | "INDIA"
    | "UK";

export type CheckoutCohort = {
    id: CohortId;
    checkoutCurrency: "usd" | "eur" | "inr" | "gbp";
    adaptivePricing: boolean;
};

const COHORT_USD: CheckoutCohort = {
    id: "USD",
    checkoutCurrency: "usd",
    adaptivePricing: false,
};

const COHORT_BR: CheckoutCohort = {
    id: "BR",
    checkoutCurrency: "eur",
    adaptivePricing: true,
};

const COHORT_APAC_ALIPAY: CheckoutCohort = {
    id: "APAC_ALIPAY",
    checkoutCurrency: "eur",
    adaptivePricing: true,
};

// AP on so non-EUR cards (CZK/PLN/SEK/etc. cards visiting EU_CORE countries)
// get localized presentment. EUR-card buyers in EU see EUR natively (AP no-op
// for them), so the only cost is a small Stripe FX margin on the edge cases
// that benefit from the localization. Symmetric with BR + APAC_ALIPAY.
const COHORT_EU_CORE: CheckoutCohort = {
    id: "EU_CORE",
    checkoutCurrency: "eur",
    adaptivePricing: true,
};

// INR is the integration currency (required for UPI to work end-to-end on
// Stripe). AP off — INR is already what the Indian buyer sees, no need to
// localize from EUR with a Stripe FX margin layer on top.
const COHORT_INDIA: CheckoutCohort = {
    id: "INDIA",
    checkoutCurrency: "inr",
    adaptivePricing: false,
};

// GBP-native integration so UK buyers see GBP without Stripe AP routing them
// through a EUR→GBP conversion (which would add ~2-4% FX margin). AP off.
const COHORT_UK: CheckoutCohort = {
    id: "UK",
    checkoutCurrency: "gbp",
    adaptivePricing: false,
};

// MO is intentionally absent: the 5,000-charge card-country audit found
// 99.8% of MO billing-country charges were US-issued cards (card-testing
// fingerprint). Routing MO into APAC_ALIPAY would hand abusers a richer
// payment-method menu. MO drops into the USD default where the abuse plan
// can deal with it.
const COHORT_BY_COUNTRY: Record<string, CheckoutCohort> = {
    BR: COHORT_BR,

    CN: COHORT_APAC_ALIPAY,
    HK: COHORT_APAC_ALIPAY,
    TW: COHORT_APAC_ALIPAY,

    NL: COHORT_EU_CORE,
    DE: COHORT_EU_CORE,
    FR: COHORT_EU_CORE,
    ES: COHORT_EU_CORE,
    BE: COHORT_EU_CORE,
    AT: COHORT_EU_CORE,
    PT: COHORT_EU_CORE,
    IE: COHORT_EU_CORE,
    IT: COHORT_EU_CORE,
    LU: COHORT_EU_CORE,
    GR: COHORT_EU_CORE,
    CY: COHORT_EU_CORE,
    MT: COHORT_EU_CORE,
    SI: COHORT_EU_CORE,
    SK: COHORT_EU_CORE,
    EE: COHORT_EU_CORE,
    LV: COHORT_EU_CORE,
    LT: COHORT_EU_CORE,
    IS: COHORT_EU_CORE,
    LI: COHORT_EU_CORE,

    IN: COHORT_INDIA,
    GB: COHORT_UK,
};

export function getCohortFromCountry(
    country: string | null | undefined,
): CheckoutCohort {
    if (!country) return COHORT_USD;
    return COHORT_BY_COUNTRY[country.toUpperCase()] ?? COHORT_USD;
}
