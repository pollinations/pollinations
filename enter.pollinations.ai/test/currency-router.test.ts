import { describe, expect, test } from "vitest";
import { getCohortFromCountry } from "../src/utils/currency-router.ts";

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
            expect(cohort.id).toBe("USD");
            expect(cohort.checkoutCurrency).toBe("usd");
            expect(cohort.adaptivePricing).toBe(false);
        });

        test("routes MO to USD (spoof-signal regression)", () => {
            // 99.8% of MO billing-country charges in the live audit were
            // US-issued cards — pure card-testing fingerprint. MO must not
            // land in APAC_ALIPAY where the richer method set would help
            // abusers probe.
            expect(getCohortFromCountry("MO").id).toBe("USD");
        });

        test.each([
            "XX",
            "",
            null,
            undefined,
        ])("routes %p to USD", (country) => {
            expect(getCohortFromCountry(country).id).toBe("USD");
        });
    });

    describe("BR cohort", () => {
        test("routes BR to BR cohort", () => {
            const cohort = getCohortFromCountry("BR");
            expect(cohort).toEqual({
                id: "BR",
                checkoutCurrency: "eur",
                adaptivePricing: true,
            });
        });
    });

    describe("APAC_ALIPAY cohort", () => {
        test.each(["CN", "HK", "TW"])("routes %s to APAC_ALIPAY", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort.id).toBe("APAC_ALIPAY");
            expect(cohort.checkoutCurrency).toBe("eur");
            expect(cohort.adaptivePricing).toBe(true);
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
            "IS",
            "LI",
        ])("routes %s to EU_CORE", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort.id).toBe("EU_CORE");
            expect(cohort.checkoutCurrency).toBe("eur");
            expect(cohort.adaptivePricing).toBe(true);
        });
    });

    describe("INDIA cohort", () => {
        test("routes IN to INDIA cohort (INR-native, AP off, UPI unlock)", () => {
            const cohort = getCohortFromCountry("IN");
            expect(cohort).toEqual({
                id: "INDIA",
                checkoutCurrency: "inr",
                adaptivePricing: false,
            });
        });
    });

    describe("UK cohort", () => {
        test("routes GB to UK cohort (GBP-native, AP off, free GBP settlement via Wise)", () => {
            const cohort = getCohortFromCountry("GB");
            expect(cohort).toEqual({
                id: "UK",
                checkoutCurrency: "gbp",
                adaptivePricing: false,
            });
        });
    });

    describe("case insensitivity", () => {
        test("lowercase country code routes to same cohort as uppercase", () => {
            expect(getCohortFromCountry("br").id).toBe("BR");
            expect(getCohortFromCountry("cn").id).toBe("APAC_ALIPAY");
            expect(getCohortFromCountry("nl").id).toBe("EU_CORE");
            expect(getCohortFromCountry("in").id).toBe("INDIA");
            expect(getCohortFromCountry("gb").id).toBe("UK");
            expect(getCohortFromCountry("us").id).toBe("USD");
        });
    });
});
