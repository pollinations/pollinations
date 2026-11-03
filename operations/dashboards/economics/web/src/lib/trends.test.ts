import { describe, expect, it } from "vitest";
import type {
    Data,
    OpPollenRow,
    OpTransactionRow,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import { buildRunway } from "./runway";
import {
    monthlyPollenTrends,
    monthlyTrends,
    trendComparison,
    trendPercentChange,
    trendPeriod,
} from "./trends";

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
    dispute_fees: 0,
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
    scope: "product" | "company" = "product",
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
        const product = find(data);
        expect(product).toMatchObject({
            gross: 1000,
            deductions: 200,
            revenue: 800,
            paidCost: 250,
            credits: 400,
            fullCost: 650,
            result: 550,
            fullResult: 150,
        });
        const company = find(data, "company");
        expect(company).toMatchObject({
            compute: 500,
            infrastructure: 150,
            payroll: 400,
            fullCost: 1050,
        });
        expect(
            (company.compute ?? 0) +
                (company.infrastructure ?? 0) +
                (company.payroll ?? 0),
        ).toBe(company.fullCost);
        expect(product.infrastructure).toBe(150);
        expect(product.payroll).toBeNull();
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
    it("limits Product to compute and infrastructure, leaving all other costs in Whole company", () => {
        const data: Data = {
            stripeSales: [sale("2026-09")],
            vendorLedger: [
                cost("2026-09"),
                cost("2026-09", { type: "infra", paid: -50, credit: -100 }),
            ],
            opTransactions: [
                bank({
                    vendor: "creator",
                    category: "creator_payout",
                    amount: -25,
                }),
                bank({
                    vendor: "dev-tools",
                    category: "development",
                    amount: -40,
                }),
                bank({}),
                bank({ vendor: "ops", category: "operations", amount: -30 }),
                bank({ vendor: "workspace", category: "office", amount: -60 }),
                bank({ vendor: "accounting", category: "admin", amount: -70 }),
                bank({ category: "balance_sheet", amount: 1250 }),
            ],
        };
        const product = find(data, "product");
        const company = find(data, "company");
        expect(product).toMatchObject({
            compute: 500,
            infrastructure: 150,
            revenue_share: null,
            development: null,
            payroll: null,
            paidCost: 250,
            credits: 400,
            fullCost: 650,
            result: 550,
            fullResult: 150,
        });
        expect(company).toMatchObject({
            revenue_share: 25,
            development: 40,
            payroll: 400,
            compute: 500,
            infrastructure: 150,
            operations: 30,
            office: 60,
            admin: 70,
            paidCost: 875,
            credits: 400,
            fullCost: 1275,
            result: -75,
            fullResult: -475,
        });
        expect((company.result ?? 0) - (company.fullResult ?? 0)).toBe(
            company.credits,
        );
        expect(product.gross).toBe(company.gross);
        expect(product.deductions).toBe(company.deductions);
        expect(product.revenue).toBe(company.revenue);
        expect((product.result ?? 0) - (product.fullResult ?? 0)).toBe(
            product.credits,
        );
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
        const { months } = monthlyTrends(data, "product", now);
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
        const { months } = monthlyTrends(data, "product", now);
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
            "product",
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
    const { months } = monthlyTrends(data, "product", now);
    expect(months.find((r) => r.month === "2026-09")).toMatchObject({
        provisional: true,
        costIncomplete: true,
    });
    expect(months.find((r) => r.month === "2026-09")?.issues).toContain(
        "Usage without provider costs: aws",
    );
    expect(trendComparison(months, "2026-09")).toBeNull();
});

it("derives reviewed fraud from Sales without changing actuals and rejects incomplete classifications", () => {
    const data: Data = {
        stripeSales: [sale("2026-09"), sale("2026-09", { currency: "EUR" })],
        vendorLedger: [cost("2026-09")],
    };
    const before = find(data);
    const sales = data.stripeSales;
    if (!sales) throw new Error("Missing fixture");
    Object.assign(sales[0], {
        fraud_refunds: 30,
        fraud_reversals: 10,
        fraud_fees: 20,
        fraud_transactions: 2,
        fraud_evidence: ["https://drive.google.com/file/d/review/view"],
    });
    Object.assign(sales[1], {
        fraud_refunds: 10,
        fraud_reversals: 5,
        fraud_fees: 5,
        fraud_transactions: 2,
        fraud_evidence: ["https://drive.google.com/file/d/review/view"],
    });
    const after = find(data);
    expect(after.result).toBe(before.result);
    expect(after.fullResult).toBe(before.fullResult);
    expect(after.oneOffFraud).toBeCloseTo(60 + 20 * 1.1513);
    expect(after.adjustedResult).toBeCloseTo(
        (before.result ?? 0) + 60 + 20 * 1.1513,
    );
    expect(after.adjustedFullResult).toBeCloseTo(
        (before.fullResult ?? 0) + 60 + 20 * 1.1513,
    );
    expect(before.adjustedResult).toBeNull();
    sales[0].coverage_complete = 0;
    expect(find(data).adjustedResult).toBeNull();
    sales[0].coverage_complete = 1;
    sales[0].fraud_refunds = 101;
    expect(find(data).adjustedResult).toBeNull();
    sales[0].fraud_refunds = -1;
    expect(find(data).adjustedResult).toBeNull();
});

it("uses completed rolling periods and never requests pre-2026 history", () => {
    expect(trendPeriod(3, now)).toEqual({ start: "2026-07", end: "2026-09" });
    expect(trendPeriod(6, now)).toEqual({ start: "2026-04", end: "2026-09" });
    expect(trendPeriod(12, now)).toEqual({ start: "2026-01", end: "2026-09" });
    expect(trendPeriod(12, new Date("2027-04-01T12:00:00Z"))).toEqual({
        start: "2026-04",
        end: "2027-03",
    });
});

describe("Pollen activity and Quest funding trends", () => {
    const usage = (overrides: Partial<OpPollenRow> = {}): OpPollenRow => ({
        month: "2026-09",
        vendor: "google",
        model: "gemini",
        currency: "POLLEN",
        cost_paid: 60,
        cost_quests: 40,
        price_paid: 90,
        price_quests: 80,
        byop_paid: 0,
        byop_quests: 0,
        model_paid: 0,
        model_quests: 0,
        requests_paid: 6,
        requests_quests: 4,
        ...overrides,
    });
    it("counts all platform Pollen, allocates known Compute funding by meter, and keeps residual costs separate", () => {
        const input: Data = {
            opPollen: [
                usage(),
                usage({
                    vendor: "cloudflare",
                    model: "worker",
                    price_paid: 5,
                    price_quests: 7,
                }),
                usage({
                    vendor: "perplexity",
                    model: "unmatched",
                    price_paid: 10,
                    price_quests: 20,
                }),
            ],
            vendorLedger: [
                cost("2026-09"),
                cost("2026-09", {
                    vendor: "google",
                    model: "not-a-pollen-model",
                    paid: -30,
                    credit: -70,
                }),
            ],
        };
        const original = JSON.stringify(input);
        const [row, absent] = monthlyPollenTrends(input, [
            "2026-09",
            "2026-08",
        ]);
        expect(row).toMatchObject({
            paidPollen: 105,
            questPollen: 107,
            questCash: 80,
            questCredits: 120,
            unallocatedCost: 100,
        });
        expect(absent).toMatchObject({
            paidPollen: null,
            questPollen: null,
            questCash: null,
            questCredits: null,
            unallocatedCost: null,
        });
        expect(JSON.stringify(input)).toBe(original);
    });
    it("distinguishes missing costs from a recorded zero and does not count a credit grant as spending", () => {
        const data: Data = {
            opPollen: [usage()],
            vendorLedger: [cost("2026-09", { paid: 0, credit: 1000 })],
        };
        expect(monthlyPollenTrends(data, ["2026-09"])[0]).toMatchObject({
            questCash: null,
            questCredits: null,
        });
        data.vendorLedger = [cost("2026-09", { paid: 0, credit: 0 })];
        expect(monthlyPollenTrends(data, ["2026-09"])[0]).toMatchObject({
            questCash: 0,
            questCredits: 0,
            unallocatedCost: 0,
        });
    });
});

it("calculates signed month changes without reversing losses or inventing a zero baseline", () => {
    expect(trendPercentChange(150, 100)).toBe(50);
    expect(trendPercentChange(80, 100)).toBe(-20);
    expect(trendPercentChange(-100, -200)).toBe(50);
    expect(trendPercentChange(-300, -200)).toBe(-50);
    expect(trendPercentChange(100, -100)).toBe(200);
    expect(trendPercentChange(0, 100)).toBe(-100);
    expect(trendPercentChange(100, 0)).toBeNull();
    expect(trendPercentChange(100, null)).toBeNull();
    expect(trendPercentChange(undefined, 100)).toBeNull();
});

it("shares recorded totals with Runway while unmatched payments stay in reconciliation", () => {
    const data: Data = {
        stripeSales: [sale("2026-09", { coverage_complete: 0 })],
        vendorLedger: [cost("2026-09")],
        opTransactions: [
            bank({ vendor: "retell", category: "compute", amount: -50 }),
        ],
    };
    const before = JSON.stringify(data);
    const runway = buildRunway(
        data.opTransactions ?? [],
        now,
        data.vendorLedger ?? [],
        undefined,
        data.stripeSales ?? [],
    );
    const col = runway.columns.find((c) => c.id === "2026-09:actual");
    const company = find(data, "company");
    expect(col?.provisional).toBe(true);
    expect(col?.totalExpensesUsd).toBe(-200);
    expect(col?.operatingResultUsd).toBe(600);
    expect(company).toMatchObject({
        paidCost: 200,
        credits: 300,
        fullCost: 500,
        result: 600,
        fullResult: 300,
        provisional: true,
    });
    expect(company.result).toBe(col?.operatingResultUsd);
    expect(company.issues).toContain(
        "Paid provider invoice or usage evidence missing",
    );
    expect(
        runway.rows.find((r) => r.vendor === "retell")?.values[
            "2026-09:actual"
        ],
    ).toBeNull();
    expect(JSON.stringify(data)).toBe(before);
});

it("shows an inactive Bank category as zero only in a month with recorded Bank activity", () => {
    const data: Data = {
        stripeSales: [sale("2026-09")],
        vendorLedger: [cost("2026-09")],
        opTransactions: [bank({})],
    };
    const recorded = find(data, "company");
    expect(recorded.payroll).toBe(400);
    expect(recorded.office).toBe(0);
    expect(find({ ...data, opTransactions: [] }, "company").office).toBeNull();
});
