import { describe, expect, it } from "vitest";
import { fxEstimatedMonths, toUsd } from "./fx";

describe("toUsd", () => {
    it("converts EUR at the month rate, accepting full dates", () => {
        expect(toUsd(100, "EUR", "2026-06-20")).toBeCloseTo(115.18, 2);
        expect(toUsd(100, "EUR", "2026-08-31")).toBeCloseTo(115.93, 2);
    });

    it("passes USD and POLLEN through 1:1", () => {
        expect(toUsd(42, "USD", "2026-06")).toBe(42);
        expect(toUsd(42, "POLLEN", "2026-06")).toBe(42);
    });

    it("converts CAD at the month rate", () => {
        expect(toUsd(100, "CAD", "2025-05-08")).toBeCloseTo(72.08, 2);
    });

    it("throws on a past CAD month missing from the table", () => {
        expect(() => toUsd(1, "CAD", "2025-04")).toThrow(/2025-04/);
    });

    it("treats a blank currency as USD (rows without that leg carry 0)", () => {
        expect(toUsd(0, "", "2026-06")).toBe(0);
        expect(() => toUsd(1, "", "2026-06")).toThrow(/Missing currency/);
    });

    it("throws on an unknown currency instead of guessing", () => {
        expect(() => toUsd(1, "GBP", "2026-06")).toThrow(/GBP/);
    });
});

describe("fxEstimatedMonths", () => {
    const eurTxn = (date: string) => ({
        entry_id: `wise-${date}`,
        kind: "transaction" as const,
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
            fxEstimatedMonths({
                opTransactions: [eurTxn("2026-06-20"), eurTxn("2026-08-31")],
            }),
        ).toEqual([]);
    });

    it("flags EUR rows in months missing from the table, deduped and sorted", () => {
        expect(
            fxEstimatedMonths({
                opTransactions: [
                    eurTxn("2031-02-01"),
                    eurTxn("2031-02-15"),
                    eurTxn("2031-01-03"),
                ],
            }),
        ).toEqual(["2031-01", "2031-02"]);
    });

    it("ignores USD rows in unknown months — only table currencies need a rate", () => {
        expect(
            fxEstimatedMonths({
                opTransactions: [{ ...eurTxn("2031-01-03"), currency: "USD" }],
            }),
        ).toEqual([]);
    });

    it("flags CAD rows past the tiny CAD table", () => {
        expect(
            fxEstimatedMonths({
                opTransactions: [{ ...eurTxn("2031-01-03"), currency: "CAD" }],
            }),
        ).toEqual(["2031-01"]);
    });
});
