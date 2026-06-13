import { describe, expect, test } from "vitest";
import {
    checkoutCurrencyForCohort,
    getCohortFromCountry,
} from "../src/utils/currency-router.ts";

describe("getCohortFromCountry", () => {
    describe("USD cohort (default)", () => {
        test.each([
            "US",
            "CA",
            "AU",
            "NZ",
            "UA",
            "JP",
            "KR",
            "ZA",
            "ZZ",
        ])("routes %s to USD", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort).toBe("USD");
        });

        test("routes MO to USD (spoof-signal regression)", () => {
            // 99.8% of MO billing-country charges in the live audit were
            // US-issued cards — pure card-testing fingerprint. MO must not
            // land in APAC_ALIPAY local-currency routing.
            expect(getCohortFromCountry("MO")).toBe("USD");
        });

        test.each([
            "XX",
            "",
            null,
            undefined,
        ])("routes %p to USD", (country) => {
            expect(getCohortFromCountry(country)).toBe("USD");
        });
    });

    describe("BR cohort", () => {
        test("routes BR to BR cohort", () => {
            const cohort = getCohortFromCountry("BR");
            expect(cohort).toBe("BR");
        });
    });

    describe("APAC_ALIPAY cohort", () => {
        test.each(["CN", "HK", "TW"])("routes %s to APAC_ALIPAY", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort).toBe("APAC_ALIPAY");
        });
    });

    describe("EU_CORE cohort", () => {
        test.each([
            "NL",
            "DE",
            "FR",
            "ES",
            "BE",
            "AT",
            "PT",
            "IE",
            "IT",
            "LU",
            "GR",
            "CY",
            "MT",
            "SI",
            "SK",
            "EE",
            "LV",
            "LT",
        ])("routes %s to EU_CORE", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort).toBe("EU_CORE");
        });

        // IS (Iceland, ISK) and LI (Liechtenstein, CHF) are NOT eurozone —
        // corrected from prior test that documented wrong behavior
        test.each([
            "IS",
            "LI",
        ])("routes %s to USD (non-euro, was wrongly EU_CORE)", (country) => {
            expect(getCohortFromCountry(country)).toBe("USD");
        });
    });

    describe("INDIA cohort", () => {
        test("routes IN to INDIA cohort", () => {
            const cohort = getCohortFromCountry("IN");
            expect(cohort).toBe("INDIA");
        });
    });

    describe("UK cohort", () => {
        test("routes GB to UK cohort", () => {
            const cohort = getCohortFromCountry("GB");
            expect(cohort).toBe("UK");
        });
    });

    describe("case insensitivity", () => {
        test("lowercase country code routes to same cohort as uppercase", () => {
            expect(getCohortFromCountry("br")).toBe("BR");
            expect(getCohortFromCountry("cn")).toBe("APAC_ALIPAY");
            expect(getCohortFromCountry("nl")).toBe("EU_CORE");
            expect(getCohortFromCountry("in")).toBe("INDIA");
            expect(getCohortFromCountry("gb")).toBe("UK");
            expect(getCohortFromCountry("us")).toBe("USD");
        });
    });
});

describe("eurozone membership (Phase 2 fix)", () => {
    test.each(["FI", "HR", "BG"])("%s is EU_CORE", (c) => {
        expect(getCohortFromCountry(c)).toBe("EU_CORE");
    });
    test.each(["IS", "LI"])("%s is NOT EU_CORE (non-euro)", (c) => {
        expect(getCohortFromCountry(c)).toBe("USD");
    });
});

describe("checkoutCurrencyForCohort", () => {
    test("EU_CORE -> eur", () => {
        expect(checkoutCurrencyForCohort("EU_CORE")).toBe("eur");
    });
    test.each([
        "USD",
        "BR",
        "APAC_ALIPAY",
        "INDIA",
        "UK",
    ] as const)("%s -> usd", (cohort) => {
        expect(checkoutCurrencyForCohort(cohort)).toBe("usd");
    });
});
