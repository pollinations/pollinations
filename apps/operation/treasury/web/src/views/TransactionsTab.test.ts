import { describe, expect, it } from "vitest";
import type { TransactionRow } from "../types";
import { aggregateTransactionsByYear } from "./TransactionsTab";

const row = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-01-01",
    vendor: "aws",
    category: "compute",
    charged_amount: 1,
    charged_currency: "USD",
    ...over,
});

describe("aggregateTransactionsByYear", () => {
    it("sums transactions by vendor, category, and currency for a year", () => {
        expect(
            aggregateTransactionsByYear({
                rows: [
                    row({ charged_amount: 10 }),
                    row({ date: "2026-02-01", charged_amount: 20 }),
                    row({
                        date: "2026-02-02",
                        charged_amount: 30,
                        charged_currency: "EUR",
                    }),
                    row({
                        date: "2026-03-01",
                        category: "saas",
                        charged_amount: 40,
                    }),
                    row({ date: "2025-12-01", charged_amount: 50 }),
                ],
                category: "all",
                vendor: "all",
                year: "2026",
            }),
        ).toEqual([
            {
                date: "2026",
                vendor: "aws",
                category: "compute",
                charged_amount: 30,
                charged_currency: "EUR",
            },
            {
                date: "2026",
                vendor: "aws",
                category: "compute",
                charged_amount: 30,
                charged_currency: "USD",
            },
            {
                date: "2026",
                vendor: "aws",
                category: "saas",
                charged_amount: 40,
                charged_currency: "USD",
            },
        ]);
    });

    it("applies vendor and category filters before summing", () => {
        expect(
            aggregateTransactionsByYear({
                rows: [
                    row({ charged_amount: 10 }),
                    row({ vendor: "google", charged_amount: 20 }),
                    row({ category: "saas", charged_amount: 30 }),
                ],
                category: "compute",
                vendor: "aws",
                year: "2026",
            }),
        ).toEqual([
            {
                date: "2026",
                vendor: "aws",
                category: "compute",
                charged_amount: 10,
                charged_currency: "USD",
            },
        ]);
    });
});
