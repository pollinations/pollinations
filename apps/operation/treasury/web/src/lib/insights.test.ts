import { describe, expect, it } from "vitest";
import type {
    Data,
    MeterMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import {
    breakEvenMultiplier,
    CATEGORY_ORDER,
    categoryColumns,
    globalNetRatio,
    monthlyRevenue,
    monthSpendDetail,
    opexIncompleteFrom,
    pnlByMonth,
    transactionCashUsd,
} from "./insights";

const revenueRow = (
    month: string,
    gross: number,
    fees: number,
    refunds = 0,
): RevenueMonthlyRow => ({
    source: "stripe",
    month,
    currency: "EUR",
    gross_amount: gross,
    fees_amount: fees,
    refunds_amount: refunds,
});

describe("monthlyRevenue", () => {
    it("converts EUR to USD and computes net per month, sorted ascending", () => {
        const rows = [
            revenueRow("2026-06", 1000, 90, 10),
            revenueRow("2026-05", 500, 45),
        ];
        const result = monthlyRevenue(rows);

        expect(result.map((entry) => entry.month)).toEqual([
            "2026-05",
            "2026-06",
        ]);
        // 2026-06: gross 1000 EUR × 1.1518, net (1000-90-10) × 1.1518
        expect(result[1].grossUsd).toBeCloseTo(1151.8, 1);
        expect(result[1].netUsd).toBeCloseTo(1036.62, 1);
        expect(result[1].netRatio).toBeCloseTo(0.9, 4);
    });

    it("reports a null ratio when gross is zero", () => {
        expect(
            monthlyRevenue([revenueRow("2026-06", 0, 0)])[0].netRatio,
        ).toBeNull();
    });
});

describe("globalNetRatio", () => {
    it("volume-blends across months", () => {
        const rows = [
            revenueRow("2026-05", 500, 100),
            revenueRow("2026-06", 1500, 100),
        ];
        const gross = 500 * 1.1673 + 1500 * 1.1518;
        const net = 400 * 1.1673 + 1400 * 1.1518;
        expect(globalNetRatio(rows)).toBeCloseTo(net / gross, 6);
    });

    it("is null with no revenue", () => {
        expect(globalNetRatio([])).toBeNull();
    });
});

describe("breakEvenMultiplier", () => {
    it("is the reciprocal of the net ratio", () => {
        expect(breakEvenMultiplier(0.91)).toBeCloseTo(1.0989, 4);
    });

    it("is null for null or zero ratios", () => {
        expect(breakEvenMultiplier(null)).toBeNull();
        expect(breakEvenMultiplier(0)).toBeNull();
    });
});

const txn = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-05-10",
    vendor: "aws",
    category: "compute",
    charged_amount: 0,
    charged_currency: "",
    paid_amount: 0,
    paid_currency: "",
    invoice_ref: "",
    match_status: "matched",
    ...over,
});

const meter = (over: Partial<MeterMonthlyRow>): MeterMonthlyRow => ({
    month: "2026-05",
    vendor: "aws",
    currency: "USD",
    credit: 0,
    paid: 0,
    source: "api",
    ...over,
});

const emptyData = (over: Partial<Data>): Data => ({
    transactions: [],
    meterMonthly: [],
    usageMonthly: [],
    runs: [],
    revenueMonthly: [],
    ...over,
});

describe("transactionCashUsd", () => {
    it("uses the bank leg when present", () => {
        const row = txn({
            paid_amount: 100,
            paid_currency: "USD",
            charged_amount: 90,
            charged_currency: "EUR",
        });
        expect(transactionCashUsd(row)).toBe(100);
    });

    it("falls back to the invoice leg, converting EUR by the row month", () => {
        const row = txn({ charged_amount: 100, charged_currency: "EUR" });
        expect(transactionCashUsd(row)).toBeCloseTo(116.73, 2);
    });

    it("is zero when both legs are empty", () => {
        expect(transactionCashUsd(txn({}))).toBe(0);
    });
});

describe("opexIncompleteFrom", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("flags the newest transaction month (batches land after month close)", () => {
        const rows = [txn({ date: "2026-05-10" }), txn({ date: "2026-06-01" })];
        expect(opexIncompleteFrom(rows, now)).toBe("2026-06");
    });

    it("never trusts the current calendar month even without rows in it", () => {
        expect(opexIncompleteFrom([txn({ date: "2026-07-02" })], now)).toBe(
            "2026-07",
        );
    });

    it("flags everything when there are no transactions", () => {
        expect(opexIncompleteFrom([], now)).toBe("0000-00");
    });
});

describe("pnlByMonth", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("blends revenue, category spend, and credit shadow per month", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-05-10",
                    category: "compute",
                    paid_amount: 1000,
                    paid_currency: "USD",
                }),
                txn({
                    date: "2026-05-25",
                    category: "payroll",
                    paid_amount: 100,
                    paid_currency: "EUR",
                }),
                txn({
                    date: "2026-06-01",
                    category: "compute",
                    paid_amount: 50,
                    paid_currency: "USD",
                }),
            ],
            meterMonthly: [meter({ month: "2026-05", credit: 200 })],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-05",
                    currency: "EUR",
                    gross_amount: 2000,
                    fees_amount: 180,
                    refunds_amount: 0,
                },
            ],
        });
        const [may, june] = pnlByMonth(data, now);

        expect(may.month).toBe("2026-05");
        expect(may.categories.compute).toBe(1000);
        expect(may.categories.payroll).toBeCloseTo(116.73, 2);
        expect(may.spendUsd).toBeCloseTo(1116.73, 2);
        expect(may.revenueNetUsd).toBeCloseTo(1820 * 1.1673, 1);
        expect(may.cashPnlUsd).toBeCloseTo(1820 * 1.1673 - 1116.73, 1);
        expect(may.creditBurnUsd).toBe(200);
        expect(may.opexIncomplete).toBe(false);

        expect(june.opexIncomplete).toBe(true);
        expect(june.revenueNetUsd).toBeNull();
        expect(june.cashPnlUsd).toBeNull();
    });

    it("reports null spend for a month with no transactions at all", () => {
        const data = emptyData({
            meterMonthly: [meter({ month: "2026-04", credit: 10 })],
        });
        const [april] = pnlByMonth(data, now);
        expect(april.month).toBe("2026-04");
        expect(april.spendUsd).toBeNull();
        expect(april.cashPnlUsd).toBeNull();
        expect(april.creditBurnUsd).toBe(10);
    });
});

describe("monthSpendDetail", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("groups the month's cash by category and vendor with shares", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-05-10",
                    vendor: "aws",
                    category: "compute",
                    paid_amount: 300,
                    paid_currency: "USD",
                }),
                txn({
                    date: "2026-05-12",
                    vendor: "aws",
                    category: "compute",
                    paid_amount: 100,
                    paid_currency: "USD",
                }),
                txn({
                    date: "2026-05-25",
                    vendor: "deel",
                    category: "payroll",
                    paid_amount: 100,
                    paid_currency: "USD",
                }),
                txn({
                    date: "2026-04-01",
                    vendor: "aws",
                    category: "compute",
                    paid_amount: 999,
                    paid_currency: "USD",
                }),
            ],
            meterMonthly: [
                meter({ month: "2026-05", vendor: "azure", credit: 50 }),
                meter({ month: "2026-05", vendor: "aws", credit: 0, paid: 10 }),
            ],
        });
        const detail = monthSpendDetail(data, "2026-05", now);

        expect(detail.spend).toEqual([
            {
                category: "compute",
                vendor: "aws",
                cashUsd: 400,
                pctOfSpend: 80,
            },
            {
                category: "payroll",
                vendor: "deel",
                cashUsd: 100,
                pctOfSpend: 20,
            },
        ]);
        expect(detail.creditBurn).toEqual([{ vendor: "azure", creditUsd: 50 }]);
        expect(detail.summary?.month).toBe("2026-05");
    });

    it("returns empty structures for a month with no data", () => {
        const detail = monthSpendDetail(emptyData({}), "2026-05", now);
        expect(detail.spend).toEqual([]);
        expect(detail.creditBurn).toEqual([]);
        expect(detail.summary).toBeNull();
    });
});

describe("categoryColumns", () => {
    it("keeps the fixed order and appends unknown categories sorted", () => {
        const months = pnlByMonth(
            emptyData({
                transactions: [
                    txn({
                        date: "2026-05-01",
                        category: "zulu",
                        paid_amount: 1,
                        paid_currency: "USD",
                    }),
                    txn({
                        date: "2026-05-02",
                        category: "compute",
                        paid_amount: 1,
                        paid_currency: "USD",
                    }),
                ],
            }),
            new Date("2026-07-06T12:00:00Z"),
        );
        expect(categoryColumns(months)).toEqual([...CATEGORY_ORDER, "zulu"]);
    });
});
