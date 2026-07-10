import { describe, expect, it } from "vitest";
import { eurUsdRate, FX_EUR_USD_FALLBACK, fxFallbackMonths, toUsd } from "./fx";

describe("eurUsdRate", () => {
    it("returns the table rate for a known month", () => {
        expect(eurUsdRate("2026-06")).toBeCloseTo(1.1518, 4);
    });

    it("falls back for unknown months", () => {
        expect(eurUsdRate("2031-01")).toBe(FX_EUR_USD_FALLBACK);
    });
});

describe("toUsd", () => {
    it("converts EUR at the month rate, accepting full dates", () => {
        expect(toUsd(100, "EUR", "2026-06-20")).toBeCloseTo(115.18, 2);
    });

    it("passes USD and POLLEN through 1:1", () => {
        expect(toUsd(42, "USD", "2026-06")).toBe(42);
        expect(toUsd(42, "POLLEN", "2026-06")).toBe(42);
    });

    it("treats a blank currency as USD (rows without that leg carry 0)", () => {
        expect(toUsd(0, "", "2026-06")).toBe(0);
    });

    it("throws on an unknown currency instead of guessing", () => {
        expect(() => toUsd(1, "GBP", "2026-06")).toThrow(/GBP/);
    });
});

describe("fxFallbackMonths", () => {
    const eurTxn = (date: string) => ({
        source: "wise",
        date,
        vendor: "google",
        category: "cloud",
        amount: -100,
        currency: "EUR",
        description: "",
        evidence: "",
        recorded_at: "2026-07-09 00:00:00",
    });

    it("stays empty while every EUR month has a table rate", () => {
        expect(
            fxFallbackMonths({ opTransactions: [eurTxn("2026-06-20")] }),
        ).toEqual([]);
    });

    it("flags EUR rows in months missing from the table, deduped and sorted", () => {
        expect(
            fxFallbackMonths({
                opTransactions: [
                    eurTxn("2031-02-01"),
                    eurTxn("2031-02-15"),
                    eurTxn("2031-01-03"),
                ],
            }),
        ).toEqual(["2031-01", "2031-02"]);
    });

    it("ignores USD rows in unknown months — only EUR needs a rate", () => {
        expect(
            fxFallbackMonths({
                opTransactions: [{ ...eurTxn("2031-01-03"), currency: "USD" }],
            }),
        ).toEqual([]);
    });
});
