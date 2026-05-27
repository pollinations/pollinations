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
        });

        test("routes MO to USD (spoof-signal regression)", () => {
            // 99.8% of MO billing-country charges in the live audit were
            // US-issued cards — pure card-testing fingerprint. MO must not
            // land in APAC_ALIPAY local-currency routing.
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
            });
        });
    });

    describe("APAC_ALIPAY cohort", () => {
        test.each(["CN", "HK", "TW"])("routes %s to APAC_ALIPAY", (country) => {
            const cohort = getCohortFromCountry(country);
            expect(cohort.id).toBe("APAC_ALIPAY");
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
        });
    });

    describe("INDIA cohort", () => {
        test("routes IN to INDIA cohort", () => {
            const cohort = getCohortFromCountry("IN");
            expect(cohort).toEqual({
                id: "INDIA",
            });
        });
    });

    describe("UK cohort", () => {
        test("routes GB to UK cohort", () => {
            const cohort = getCohortFromCountry("GB");
            expect(cohort).toEqual({
                id: "UK",
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
