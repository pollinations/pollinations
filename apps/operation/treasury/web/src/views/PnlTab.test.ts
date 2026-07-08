import { describe, expect, it } from "vitest";
import { pnlStatement } from "../lib/insights";
import type {
    Data,
    ProviderMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import { pnlCellText, pnlTone, statSourceFromLines } from "./PnlTab";

const now = new Date("2026-07-06T12:00:00Z");

const txn = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-05-10",
    vendor: "aws",
    category: "compute",
    charged_amount: 0,
    charged_currency: "USD",
    ...over,
});

const provider = (over: Partial<ProviderMonthlyRow>): ProviderMonthlyRow => ({
    month: "2026-05",
    vendor: "lambda",
    currency: "USD",
    credit: 0,
    paid: 0,
    source: "api",
    ...over,
});

const revenue = (month: string, gross: number): RevenueMonthlyRow => ({
    source: "stripe",
    month,
    currency: "USD",
    gross_amount: gross,
    fees_amount: 0,
    refunds_amount: 0,
});

const data: Data = {
    transactions: [
        txn({
            date: "2026-05-10",
            vendor: "aws",
            category: "compute",
            charged_amount: 400,
        }),
        txn({
            date: "2026-05-25",
            vendor: "deel",
            category: "payroll",
            charged_amount: 100,
        }),
        txn({
            date: "2026-06-05",
            vendor: "aws",
            category: "compute",
            charged_amount: 500,
        }),
        txn({
            date: "2026-06-06",
            vendor: "runpod",
            category: "compute",
            charged_amount: 100,
        }),
        txn({
            date: "2026-07-02",
            vendor: "aws",
            category: "compute",
            charged_amount: 50,
        }),
    ],
    providerMonthly: [
        provider({ month: "2026-05", credit: 200 }),
        provider({ month: "2026-06", credit: 300 }),
    ],
    pollenMonthly: [],
    grants: [],
    runs: [],
    revenueMonthly: [revenue("2026-05", 1000), revenue("2026-06", 2000)],
    gpuFleet: [],
    gpuBilling: [],
    gpuRuns: [],
};

const lineKeys = (result: ReturnType<typeof pnlStatement>) =>
    result.lines.map((line) => line.key);

describe("PnlTab statement shape", () => {
    it("renders the same line-item rows for both year and month filters", () => {
        const year = pnlStatement(data, "2026", now);
        const month = pnlStatement(data, "2026-06", now);
        // Every category present as a row in both, plus the fixed line items —
        // the rows never change with the filter.
        expect(lineKeys(year)).toEqual(lineKeys(month));
        expect(lineKeys(year)).toContain("revenue");
        expect(lineKeys(year)).toContain("compute");
        expect(lineKeys(year)).toContain("total-spend");
        expect(lineKeys(year)).toContain("cash-pnl");
        expect(lineKeys(year)).toContain("net-margin");
        expect(lineKeys(year)).toContain("credit-burn");
    });

    it("differs only in period columns: year is months+YTD, month is prior·selected·Δ", () => {
        const year = pnlStatement(data, "2026", now);
        const month = pnlStatement(data, "2026-06", now);
        expect(year.periods.map((p) => p.key)).toEqual([
            "2026-05",
            "2026-06",
            "2026-07",
            "total",
        ]);
        expect(month.periods.map((p) => p.key)).toEqual([
            "2026-05",
            "2026-06",
            "delta",
        ]);
    });

    it("flags the in-progress month on its period header", () => {
        const year = pnlStatement(data, "2026", now);
        const july = year.periods.find((p) => p.key === "2026-07");
        expect(july?.inProgress).toBe(true);
        const may = year.periods.find((p) => p.key === "2026-05");
        expect(may?.inProgress).toBe(false);
    });
});

describe("PnlTab cell rendering", () => {
    it("formats money lines with fmtUsd", () => {
        const year = pnlStatement(data, "2026", now);
        const revenueLine = year.lines.find((l) => l.key === "revenue");
        const total = year.periods.find((p) => p.key === "total");
        if (!revenueLine || !total) throw new Error("missing");
        expect(pnlCellText(revenueLine, total)).toBe("$3,000");
    });

    it("renders net margin as a percentage, not dollars", () => {
        const year = pnlStatement(data, "2026", now);
        const margin = year.lines.find((l) => l.key === "net-margin");
        const may = year.periods.find((p) => p.key === "2026-05");
        if (!margin || !may) throw new Error("missing");
        // May: rev 1000, spend 500 → pnl 500 → 50% margin.
        const text = pnlCellText(margin, may);
        expect(text).toContain("%");
        expect(text).not.toContain("$");
        expect(text).toBe("+50%");
    });

    it("parenthesizes credit burn and dashes when absent", () => {
        const year = pnlStatement(data, "2026", now);
        const burn = year.lines.find((l) => l.key === "credit-burn");
        const may = year.periods.find((p) => p.key === "2026-05");
        const july = year.periods.find((p) => p.key === "2026-07");
        if (!burn || !may || !july) throw new Error("missing");
        // May had 200 credit burn.
        expect(pnlCellText(burn, may)).toBe("($200)");
        // July had none.
        expect(pnlCellText(burn, july)).toBe("–");
    });

    it("signs the delta column of money lines", () => {
        const month = pnlStatement(data, "2026-06", now);
        const revenueLine = month.lines.find((l) => l.key === "revenue");
        const delta = month.periods.find((p) => p.key === "delta");
        if (!revenueLine || !delta) throw new Error("missing");
        // Revenue rose 1000 → 2000, Δ = +1000.
        expect(revenueLine.values.delta).toBe(1000);
        expect(pnlCellText(revenueLine, delta)).toBe("$1,000");
    });
});

describe("PnlTab vendor drill-down", () => {
    it("exposes category vendor sub-rows in the same period columns", () => {
        const year = pnlStatement(data, "2026", now);
        const compute = year.lines.find((l) => l.key === "compute");
        if (!compute?.vendors) throw new Error("compute vendors missing");
        const vendorNames = compute.vendors.map((v) => v.vendor);
        expect(vendorNames).toContain("aws");
        expect(vendorNames).toContain("runpod");
        // Sub-rows carry the same period keys as the category row.
        for (const period of year.periods) {
            const sum = compute.vendors.reduce(
                (total, v) => total + (v.values[period.key] ?? 0),
                0,
            );
            expect(sum).toBeCloseTo(compute.values[period.key] ?? 0, 6);
        }
    });
});

describe("statSourceFromLines", () => {
    it("derives the four card figures from the primary period", () => {
        const year = pnlStatement(data, "2026", now);
        const source = statSourceFromLines(year.lines, year.primary);
        expect(source.revenueNetUsd).toBe(3000);
        // compute 1050 + payroll 100 = 1150 total spend.
        expect(source.spendUsd).toBe(1150);
        // cash-pnl total sums per-month P&Ls where both sides exist: May
        // 1000−500=500, June 2000−600=1400; July is spend-only → excluded.
        expect(source.cashPnlUsd).toBe(1900);
        expect(source.creditBurnUsd).toBe(500);
        expect(source.categories.compute).toBe(1050);
        expect(source.categories.payroll).toBe(100);
    });

    it("falls back to 0 credit burn when the primary period has none", () => {
        const noBurn: Data = { ...data, providerMonthly: [] };
        const year = pnlStatement(noBurn, "2026", now);
        const source = statSourceFromLines(year.lines, year.primary);
        expect(source.creditBurnUsd).toBe(0);
    });
});

describe("pnlTone", () => {
    it("greens non-negative, reds negative, blanks null", () => {
        expect(pnlTone(10)).toBe("text-intent-success-text");
        expect(pnlTone(0)).toBe("text-intent-success-text");
        expect(pnlTone(-5)).toBe("text-intent-danger-text");
        expect(pnlTone(null)).toBe("");
    });
});
