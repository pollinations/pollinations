export type CohortId =
    | "USD"
    | "BR"
    | "APAC_ALIPAY"
    | "EU_CORE"
    | "INDIA"
    | "UK";

// MO is intentionally absent: the 5,000-charge card-country audit found
// 99.8% of MO billing-country charges were US-issued cards (card-testing
// fingerprint). MO drops into the USD default instead of APAC local-currency
// routing where the abuse plan can deal with it.
const COHORT_BY_COUNTRY: Record<string, CohortId> = {
    BR: "BR",

    CN: "APAC_ALIPAY",
    HK: "APAC_ALIPAY",
    TW: "APAC_ALIPAY",

    NL: "EU_CORE",
    DE: "EU_CORE",
    FR: "EU_CORE",
    ES: "EU_CORE",
    BE: "EU_CORE",
    AT: "EU_CORE",
    PT: "EU_CORE",
    IE: "EU_CORE",
    IT: "EU_CORE",
    LU: "EU_CORE",
    GR: "EU_CORE",
    CY: "EU_CORE",
    MT: "EU_CORE",
    SI: "EU_CORE",
    SK: "EU_CORE",
    EE: "EU_CORE",
    LV: "EU_CORE",
    LT: "EU_CORE",
    IS: "EU_CORE",
    LI: "EU_CORE",

    IN: "INDIA",
    GB: "UK",
};

export function getCohortFromCountry(
    country: string | null | undefined,
): CohortId {
    if (!country) return "USD";
    return COHORT_BY_COUNTRY[country.toUpperCase()] ?? "USD";
}
