import { describe, expect, test } from "vitest";
import {
    checkoutCurrencyForCohort,
    getCheckoutCountry,
    getCohortFromCountry,
} from "../src/utils/currency-router.ts";

// Minimal Hono-context stand-in: only header() is used by getCheckoutCountry.
const ctxWithHeaders = (headers: Record<string, string>) => ({
    req: { header: (name: string) => headers[name.toLowerCase()] },
});

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

describe("getCheckoutCountry", () => {
    test("prefers CloudFront-Viewer-Country over CF-IPCountry", () => {
        // CloudFront is outermost, so CF-IPCountry is the edge POP (e.g. US)
        // while CloudFront-Viewer-Country is the real buyer (DE).
        const c = ctxWithHeaders({
            "cloudfront-viewer-country": "DE",
            "cf-ipcountry": "US",
        });
        expect(getCheckoutCountry(c)).toBe("DE");
    });

    test("falls back to CF-IPCountry when CloudFront header absent", () => {
        // Direct Cloudflare hit (local dev, no CloudFront in front).
        const c = ctxWithHeaders({ "cf-ipcountry": "FR" });
        expect(getCheckoutCountry(c)).toBe("FR");
    });

    test("returns undefined when neither header is present", () => {
        expect(getCheckoutCountry(ctxWithHeaders({}))).toBeUndefined();
    });

    test("routes correctly end-to-end through CloudFront header", () => {
        // The real bug: behind CloudFront, CF-IPCountry=US would force USD for a
        // German buyer. CloudFront-Viewer-Country=DE restores EUR routing.
        const c = ctxWithHeaders({
            "cloudfront-viewer-country": "DE",
            "cf-ipcountry": "US",
        });
        expect(
            checkoutCurrencyForCohort(
                getCohortFromCountry(getCheckoutCountry(c)),
            ),
        ).toBe("eur");
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
