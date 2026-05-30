import { POLLEN_PACKS } from "@shared/pollen-packs.ts";
import { describe, expect, test } from "vitest";
import {
    AP_FEE_ESTIMATE,
    buildLocalizedPrices,
    computeObservedMarkup,
    currencyForCountry,
    formatLocalAmount,
    isZeroDecimalCurrency,
    localizeUsdAmount,
    nextMarkupEma,
    SUPPORTED_PRESENTMENT_CURRENCIES,
} from "../src/utils/fx-quotes.ts";

describe("currencyForCountry", () => {
    test.each([
        ["DE", "eur"],
        ["FR", "eur"],
        ["NL", "eur"],
        ["GB", "gbp"],
        ["BR", "brl"],
        ["IN", "inr"],
        ["JP", "jpy"],
        ["CA", "cad"],
    ])("maps %s -> %s", (country, currency) => {
        expect(currencyForCountry(country)).toBe(currency);
    });

    test("is case-insensitive", () => {
        expect(currencyForCountry("de")).toBe("eur");
    });

    test.each([
        "US",
        "ZZ",
        "",
        null,
        undefined,
    ])("returns null for unmapped/USD country %s", (country) => {
        expect(currencyForCountry(country)).toBeNull();
    });

    test("every mapped currency is in the supported fetch list", () => {
        // The route fetches SUPPORTED_PRESENTMENT_CURRENCIES in one FX quote;
        // a country mapped to a currency we never fetch would always fall back.
        for (const country of ["DE", "GB", "BR", "IN", "JP", "CA"]) {
            const currency = currencyForCountry(country);
            expect(currency).not.toBeNull();
            expect(SUPPORTED_PRESENTMENT_CURRENCIES).toContain(currency);
        }
    });

    test("never maps any country to usd", () => {
        expect(SUPPORTED_PRESENTMENT_CURRENCIES).not.toContain("usd");
    });
});

describe("isZeroDecimalCurrency", () => {
    test.each(["jpy", "krw"])("%s is zero-decimal", (currency) => {
        expect(isZeroDecimalCurrency(currency)).toBe(true);
    });

    test.each([
        "eur",
        "gbp",
        "brl",
        "usd",
    ])("%s is not zero-decimal", (currency) => {
        expect(isZeroDecimalCurrency(currency)).toBe(false);
    });
});

describe("localizeUsdAmount", () => {
    // midRate = mid-market USD value of 1 unit of the local currency (Stripe
    // reference_rate). local = (usd / midRate) * markup; default markup is the
    // 4% cold-start estimate.
    test("converts USD to local at mid-market + default 4% markup", () => {
        // EUR reference_rate 1.1617 -> (70 / 1.1617) * 1.04 = 62.67.
        expect(localizeUsdAmount(70, 1.1617, "eur")).toBe(62.67);
    });

    test("uses an explicit (learned) markup when provided", () => {
        // Learned EUR markup 1.0368 -> (70 / 1.1617) * 1.0368 = 62.47.
        expect(localizeUsdAmount(70, 1.1617, "eur", 1.0368)).toBe(62.47);
    });

    test("default markup adds AP_FEE_ESTIMATE on top of mid-market", () => {
        const estimate = localizeUsdAmount(70, 1.1617, "eur");
        const pureMid = 70 / 1.1617;
        expect(estimate).toBeGreaterThan(pureMid);
        expect(estimate).toBeCloseTo(pureMid * (1 + AP_FEE_ESTIMATE), 1);
    });

    test("rounds zero-decimal currencies to whole units", () => {
        // JPY reference_rate 0.00627132 -> (70 / 0.00627132) * 1.04 = 11608.3
        expect(localizeUsdAmount(70, 0.00627132, "jpy")).toBe(11608);
    });

    test("rounds decimal currencies to 2 places", () => {
        expect(localizeUsdAmount(70, 1.1617, "eur")).toBe(62.67);
    });
});

describe("computeObservedMarkup", () => {
    test("recovers the markup from a decimal-currency purchase", () => {
        // EUR: paid €7.14 (714) for $8.00 (800), mid 1.1617 -> markup 1.0368.
        expect(computeObservedMarkup(714, 800, 1.1617, "eur")).toBeCloseTo(
            1.0368,
            4,
        );
    });

    test("recovers the markup from a zero-decimal currency (JPY)", () => {
        // JPY: paid ¥1314 for $8.00 (800 cents), mid 0.00627132 -> ~1.030.
        expect(computeObservedMarkup(1314, 800, 0.00627132, "jpy")).toBeCloseTo(
            1.0301,
            3,
        );
    });

    test("recovers India's hotter ~4.5% markup", () => {
        // INR: paid ₹7000.54 (700054) for $70 (7000 cents), mid 0.0104497.
        expect(
            computeObservedMarkup(700054, 7000, 0.0104497, "inr"),
        ).toBeCloseTo(1.0451, 3);
    });

    test.each([
        [0, 800],
        [714, 0],
    ])("returns null for non-positive amounts (%s, %s)", (pres, usd) => {
        expect(computeObservedMarkup(pres, usd, 1.1617, "eur")).toBeNull();
    });
});

describe("nextMarkupEma", () => {
    test("seeds to the observed value on first observation", () => {
        expect(nextMarkupEma(undefined, 1.0368)).toBe(1.0368);
    });

    test("blends previous and observed by alpha", () => {
        // 0.25 * 1.0368 + 0.75 * 1.04 = 1.0392
        expect(nextMarkupEma(1.04, 1.0368, 0.25)).toBeCloseTo(1.0392, 5);
    });
});

describe("formatLocalAmount", () => {
    test("formats decimal currency with symbol and 2 places", () => {
        expect(formatLocalAmount(61.38, "eur")).toBe("€61.38");
    });

    test("formats zero-decimal currency with no decimals", () => {
        expect(formatLocalAmount(11388, "jpy")).toBe("¥11,388");
    });
});

describe("buildLocalizedPrices", () => {
    test("produces an entry for every pack keyed by packKey", () => {
        const prices = buildLocalizedPrices(POLLEN_PACKS, "eur", 1.1617);
        for (const pack of POLLEN_PACKS) {
            const entry = prices[pack.packKey];
            expect(entry).toBeDefined();
            expect(entry.amount).toBe(
                localizeUsdAmount(pack.amountUsd, 1.1617, "eur"),
            );
            expect(entry.formatted).toBe(
                formatLocalAmount(entry.amount, "eur"),
            );
        }
    });
});
