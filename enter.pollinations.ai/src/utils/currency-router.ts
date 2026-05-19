export type CohortId = "USD" | "BR" | "APAC_ALIPAY" | "EU_CORE";

export type CohortPmcEnvVar =
    | "STRIPE_PMC_USD"
    | "STRIPE_PMC_BR"
    | "STRIPE_PMC_APAC_ALIPAY"
    | "STRIPE_PMC_EU_CORE";

export type CheckoutCohort = {
    id: CohortId;
    checkoutCurrency: "usd" | "eur";
    adaptivePricing: boolean;
    pmcEnvVar: CohortPmcEnvVar;
};

const COHORT_USD: CheckoutCohort = {
    id: "USD",
    checkoutCurrency: "usd",
    adaptivePricing: false,
    pmcEnvVar: "STRIPE_PMC_USD",
};

const COHORT_BR: CheckoutCohort = {
    id: "BR",
    checkoutCurrency: "eur",
    adaptivePricing: true,
    pmcEnvVar: "STRIPE_PMC_BR",
};

const COHORT_APAC_ALIPAY: CheckoutCohort = {
    id: "APAC_ALIPAY",
    checkoutCurrency: "eur",
    adaptivePricing: true,
    pmcEnvVar: "STRIPE_PMC_APAC_ALIPAY",
};

const COHORT_EU_CORE: CheckoutCohort = {
    id: "EU_CORE",
    checkoutCurrency: "eur",
    adaptivePricing: false,
    pmcEnvVar: "STRIPE_PMC_EU_CORE",
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
};

export function getCohortFromCountry(
    country: string | null | undefined,
): CheckoutCohort {
    if (!country) return COHORT_USD;
    return COHORT_BY_COUNTRY[country.toUpperCase()] ?? COHORT_USD;
}
