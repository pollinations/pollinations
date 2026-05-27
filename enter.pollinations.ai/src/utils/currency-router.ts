export type CohortId =
    | "USD"
    | "BR"
    | "APAC_ALIPAY"
    | "EU_CORE"
    | "INDIA"
    | "UK";

export type CheckoutCohort = {
    id: CohortId;
    adaptivePricing: boolean;
    checkoutCurrency?: "gbp" | "inr";
};

const COHORT_USD: CheckoutCohort = {
    id: "USD",
    adaptivePricing: false,
};

const COHORT_BR: CheckoutCohort = {
    id: "BR",
    adaptivePricing: true,
};

const COHORT_APAC_ALIPAY: CheckoutCohort = {
    id: "APAC_ALIPAY",
    adaptivePricing: true,
};

const COHORT_EU_CORE: CheckoutCohort = {
    id: "EU_CORE",
    adaptivePricing: true,
};

// INR is a manual currency option on the managed Stripe Price. AP off because
// UPI requires INR, so force the Checkout Session currency instead of relying
// on Checkout's IP-based currency inference.
const COHORT_INDIA: CheckoutCohort = {
    id: "INDIA",
    adaptivePricing: false,
    checkoutCurrency: "inr",
};

// GBP is a manual currency option on the managed Stripe Price. Force GBP so UK
// revenue settles to the configured Wise GBP account.
const COHORT_UK: CheckoutCohort = {
    id: "UK",
    adaptivePricing: false,
    checkoutCurrency: "gbp",
};

// MO is intentionally absent: the 5,000-charge card-country audit found
// 99.8% of MO billing-country charges were US-issued cards (card-testing
// fingerprint). MO drops into the USD default instead of APAC local-currency
// routing where the abuse plan can deal with it.
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
