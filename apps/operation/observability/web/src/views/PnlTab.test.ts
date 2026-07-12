import { describe, expect, it } from "vitest";
import { pnlStatement } from "../lib/insights";
import type { Data, OpTransactionRow } from "../types";
import { pnlCellText, pnlTone, statSourceFromLines } from "./PnlTab";

const now = new Date("2026-07-06T12:00:00Z");

const opTxn = (over: Partial<OpTransactionRow>): OpTransactionRow => ({
    source: "wise",
    date: "2026-05-10",
    vendor: "aws",
    category: "cloud",
    amount: 0,
    currency: "USD",
    description: "",
    evidence: "",
    recorded_at: "2026-07-09 00:00:00",
    ...over,
});

const data: Data = {
    opTransactions: [
        opTxn({
            date: "2026-05-10",
            vendor: "stripe",
            category: "revenue",
            amount: 1000,
        }),
        opTxn({
            date: "2026-05-10",
            vendor: "aws",
            category: "cloud",
            amount: -400,
        }),
        opTxn({
            date: "2026-05-25",
            vendor: "deel",
            category: "payroll",
            amount: -100,
        }),
        opTxn({
            date: "2026-06-05",
            vendor: "stripe",
            category: "revenue",
            amount: 2000,
        }),
        opTxn({
            date: "2026-06-05",
            vendor: "aws",
            category: "cloud",
            amount: -500,
        }),
        opTxn({
            date: "2026-06-06",
            vendor: "runpod",
            category: "cloud",
            amount: -100,
        }),
        opTxn({
            date: "2026-07-02",
            vendor: "aws",
            category: "cloud",
            amount: -50,
        }),
    ],
    opCloud: [],
    opPollen: [],
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
        expect(lineKeys(year)).toContain("cloud");
        expect(lineKeys(year)).toContain("total-spend");
        expect(lineKeys(year)).toContain("cash-pnl");
        expect(lineKeys(year)).toContain("net-margin");
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
        const cloud = year.lines.find((l) => l.key === "cloud");
        if (!cloud?.vendors) throw new Error("cloud vendors missing");
        const vendorNames = cloud.vendors.map((v) => v.vendor);
        expect(vendorNames).toContain("aws");
        expect(vendorNames).toContain("runpod");
        // Sub-rows carry the same period keys as the category row.
        for (const period of year.periods) {
            const sum = cloud.vendors.reduce(
                (total, v) => total + (v.values[period.key] ?? 0),
                0,
            );
            expect(sum).toBeCloseTo(cloud.values[period.key] ?? 0, 6);
        }
    });
});

describe("statSourceFromLines", () => {
    it("derives the four card figures from the primary period", () => {
        const year = pnlStatement(data, "2026", now);
        const source = statSourceFromLines(year.lines, year.primary);
        expect(source.revenueNetUsd).toBe(3000);
        // cloud 1050 + payroll 100 = 1150 total spend.
        expect(source.spendUsd).toBe(1150);
        // cash-pnl total sums per-month P&Ls where both sides exist: May
        // 1000−500=500, June 2000−600=1400; July is spend-only → excluded.
        expect(source.cashPnlUsd).toBe(1900);
        expect(source.categories.cloud).toBe(1050);
        expect(source.categories.payroll).toBe(100);
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
