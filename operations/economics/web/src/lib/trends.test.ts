import { describe, expect, it } from "vitest";
import type {
    Data,
    OpTransactionRow,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import { buildRunway } from "./runway";
import { monthlyTrends, trendComparison } from "./trends";

const now = new Date("2026-10-14T12:00:00Z");
const sale = (
    month: string,
    overrides: Partial<StripeSalesRow> = {},
): StripeSalesRow => ({
    month,
    revenue_stream: "pollen",
    currency: "USD",
    coverage_complete: 1,
    gross_sales: 1000,
    refunds: 100,
    reversals: 20,
    stripe_fees: 80,
    net_sales: 880,
    net_after_fees: 800,
    payments: 10,
    refund_count: 1,
    ...overrides,
});
const cost = (
    month: string,
    overrides: Partial<VendorLedgerRow> = {},
): VendorLedgerRow => ({
    entry_id: `usage-${month}`,
    source: "dashboard",
    vendor: "google",
    type: "inference",
    start: `${month}-01`,
    end: `${month}-30`,
    paid: -200,
    credit: -300,
    currency: "USD",
    resource_id: "usage",
    resource_name: "Usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "gemini",
    evidence: "Provider statement",
    recorded_at: "2026-10-14 00:00:00",
    ...overrides,
});
const bank = (overrides: Partial<OpTransactionRow>): OpTransactionRow => ({
    entry_id: "bank",
    kind: "transaction",
    source: "wise",
    date: "2026-09-30",
    vendor: "deel",
    category: "payroll",
    amount: -400,
    currency: "USD",
    description: "Salary",
    evidence: "Statement",
    recorded_at: "2026-10-14 00:00:00",
    ...overrides,
});
const find = (
    data: Data,
    scope: "compute" | "company" = "compute",
    month = "2026-09",
) => {
    const row = monthlyTrends(data, scope, now).months.find(
        (r) => r.month === month,
    );
    if (!row) throw new Error(`Missing ${month}`);
    return row;
};

describe("monthly sales-based trends", () => {
    it("separates gross sales, deductions and consumed credits, excluding payouts and refundable deposits", () => {
        const data: Data = {
            stripeSales: [sale("2026-09")],
            vendorLedger: [
                cost("2026-09"),
                cost("2026-09", { type: "balance", paid: 9000, credit: 20000 }),
                cost("2026-09", { paid: 0, credit: 10000 }),
                cost("2026-09", { type: "infra", paid: -50, credit: -100 }),
            ],
            opTransactions: [
                bank({}),
                bank({ vendor: "stripe", category: "revenue", amount: 7000 }),
                bank({ category: "balance_sheet", amount: 1250 }),
            ],
        };
        const api = find(data);
        expect(api).toMatchObject({
            gross: 1000,
            deductions: 200,
            revenue: 800,
            paidCost: 200,
            credits: 300,
            fullCost: 500,
            result: 600,
            fullResult: 300,
        });
        const company = find(data, "company");
        expect(company).toMatchObject({
            computeCost: 500,
            infrastructureCost: 150,
            operationsCost: 400,
            fullCost: 1050,
        });
        expect(
            (company.computeCost ?? 0) +
                (company.infrastructureCost ?? 0) +
                (company.operationsCost ?? 0),
        ).toBe(company.fullCost);
        expect(api.infrastructureCost).toBeNull();
        expect(api.operationsCost).toBeNull();
        expect(company).toMatchObject({
            paidCost: 650,
            credits: 400,
            result: 150,
            fullResult: -250,
        });
        const runway = buildRunway(
            data.opTransactions ?? [],
            now,
            data.vendorLedger ?? [],
            undefined,
            data.stripeSales ?? [],
        );
        expect(company.result).toBe(
            runway.columns.find((c) => c.id === "2026-09:actual")
                ?.operatingResultUsd,
        );
        if (company.result == null || company.fullResult == null)
            throw new Error("Missing results");
        expect(company.result - company.fullResult).toBe(company.credits);
    });
    it("does not turn absent sales, absent usage, or a credit grant into zero-cost profit", () => {
        expect(find({ vendorLedger: [cost("2026-09")] })).toMatchObject({
            revenue: null,
            result: null,
            provisional: true,
        });
        expect(find({ stripeSales: [sale("2026-09")] })).toMatchObject({
            paidCost: null,
            fullResult: null,
            provisional: true,
        });
        expect(
            find({
                stripeSales: [sale("2026-09")],
                vendorLedger: [cost("2026-09", { paid: 0, credit: 1000 })],
            }).result,
        ).toBeNull();
        expect(
            find({
                stripeSales: [sale("2026-09", { net_sales: 999 })],
                vendorLedger: [cost("2026-09")],
            }).result,
        ).toBeNull();
    });
    it("explains a better underlying result despite reduced credit support", () => {
        const data = {
            stripeSales: [sale("2026-08"), sale("2026-09")],
            vendorLedger: [
                cost("2026-08", { paid: -100, credit: -600 }),
                cost("2026-09"),
            ],
        };
        const { months } = monthlyTrends(data, "compute", now);
        expect(trendComparison(months, "2026-09")).toMatchObject({
            fullResult: 200,
            credits: -300,
            result: -100,
        });
        expect(
            trendComparison(
                months.filter((r) => r.month !== "2026-08"),
                "2026-09",
            ),
        ).toBeNull();
    });
    it("keeps unverified and current periods visible without comparing them with complete months", () => {
        const data = {
            stripeSales: [
                sale("2026-08"),
                sale("2026-09", { coverage_complete: 0 }),
                sale("2026-10"),
            ],
            vendorLedger: [cost("2026-08"), cost("2026-09"), cost("2026-10")],
        };
        const { months } = monthlyTrends(data, "compute", now);
        expect(months.find((r) => r.month === "2026-09")).toMatchObject({
            revenue: 800,
            provisional: true,
        });
        expect(trendComparison(months, "2026-09")).toBeNull();
        expect(trendComparison(months, "2026-10")).toBeNull();
        expect(months.at(-1)?.month).toBe("2026-10");
    });
    it("preserves known missing-invoice warnings", () => {
        const result = monthlyTrends(
            {
                opTransactions: [
                    bank({
                        vendor: "retell",
                        category: "compute",
                        amount: -50,
                    }),
                ],
                stripeSales: [sale("2026-09")],
                vendorLedger: [cost("2026-09")],
            },
            "compute",
            now,
        );
        expect(result.warnings.some((w) => w.includes("retell"))).toBe(true);
    });
});

it("does not claim improving results when usage exists but its provider costs are absent", () => {
    const data: Data = {
        stripeSales: [sale("2026-08"), sale("2026-09")],
        vendorLedger: [cost("2026-08"), cost("2026-09")],
        opPollen: [
            {
                month: "2026-09",
                vendor: "aws",
                model: "claude",
                currency: "USD",
                price_paid: 100,
                price_quests: 0,
                cost_paid: 70,
                cost_quests: 0,
                byop_paid: 0,
                byop_quests: 0,
                model_paid: 0,
                model_quests: 0,
                requests_paid: 1,
                requests_quests: 0,
            },
        ],
    };
    const { months } = monthlyTrends(data, "compute", now);
    expect(months.find((r) => r.month === "2026-09")).toMatchObject({
        provisional: true,
        costIncomplete: true,
    });
    expect(months.find((r) => r.month === "2026-09")?.issues).toContain(
        "Usage without provider costs: aws",
    );
    expect(trendComparison(months, "2026-09")).toBeNull();
});
