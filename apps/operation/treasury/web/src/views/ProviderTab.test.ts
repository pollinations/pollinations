import { describe, expect, it } from "vitest";
import type { ProviderMonthlyRow } from "../types";
import { aggregateProviderByYear, visibleProviderRows } from "./ProviderTab";

const row = (month: string, vendor: string): ProviderMonthlyRow => ({
    month,
    vendor,
    currency: "USD",
    credit: 1,
    paid: 0,
    source: "api",
});

describe("visibleProviderRows", () => {
    const rows = [
        row("2026-06", "aws"),
        row("2026-07", "aws"),
        row("2026-07", "gcp"),
    ];

    it("filters by month and vendor", () => {
        expect(
            visibleProviderRows({
                providerRows: rows,
                month: "2026-07",
                vendor: "aws",
            }),
        ).toEqual([row("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(
            visibleProviderRows({
                providerRows: rows,
                month: "",
                vendor: "all",
            }),
        ).toEqual(rows);
    });
});

describe("aggregateProviderByYear", () => {
    it("sums provider rows by vendor and currency for a year", () => {
        expect(
            aggregateProviderByYear({
                providerRows: [
                    {
                        ...row("2026-01", "aws"),
                        credit: 2,
                        paid: 3,
                        source: "api",
                    },
                    {
                        ...row("2026-02", "aws"),
                        credit: 4,
                        paid: 5,
                        source: "bq",
                    },
                    {
                        ...row("2025-12", "aws"),
                        credit: 8,
                        paid: 9,
                        source: "api",
                    },
                    {
                        ...row("2026-03", "aws"),
                        currency: "EUR",
                        credit: 10,
                        paid: 11,
                        source: "cli",
                    },
                ],
                vendor: "all",
                year: "2026",
            }),
        ).toEqual([
            {
                month: "2026",
                vendor: "aws",
                currency: "EUR",
                credit: 10,
                paid: 11,
                source: "cli",
            },
            {
                month: "2026",
                vendor: "aws",
                currency: "USD",
                credit: 6,
                paid: 8,
                source: "api,bq",
            },
        ]);
    });
});
