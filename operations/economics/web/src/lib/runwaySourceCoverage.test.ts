import { describe, expect, it } from "vitest";
import type {
    OpTransactionRow,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import { providerAccountBalanceRows } from "./providerBalances";
import {
    bankPaymentHasServiceEvidence,
    providerCloseRows,
} from "./providerClose";
import { buildRunway } from "./runway";

const now = new Date("2026-10-16T12:00:00Z");
const invoice = "https://drive.google.com/file/d/retained-invoice/view";
const bank = (over: Partial<OpTransactionRow> = {}): OpTransactionRow => ({
    entry_id: "payment",
    kind: "transaction",
    source: "wise",
    date: "2026-09-19",
    vendor: "tinybird",
    category: "infrastructure",
    amount: -266.88,
    currency: "USD",
    description: "Invoice payment",
    evidence: `evidence_type=supplier_document; invoice=${invoice}; payment_match=verified`,
    recorded_at: "2026-10-01",
    ...over,
});
const opening = bank({
    entry_id: "opening",
    kind: "opening_balance",
    date: "2026-01-01",
    vendor: "wise",
    category: "balance_sheet",
    amount: 10000,
});
const vendor = (over: Partial<VendorLedgerRow> = {}): VendorLedgerRow => ({
    entry_id: "usage",
    source: "invoice",
    vendor: "tinybird",
    account_id: "myceli",
    type: "infra",
    start: "2026-08-01 00:00:00",
    end: "2026-09-01 00:00:00",
    credit: 0,
    paid: -218.56,
    currency: "USD",
    resource_id: "plan",
    resource_name: "Provider usage",
    resource_sku: "usage",
    resource_count: 1,
    model: "",
    evidence: "https://drive.google.com/file/d/older-invoice/view",
    recorded_at: "2026-10-01",
    ...over,
});
const sales: StripeSalesRow = {
    month: "2026-09",
    revenue_stream: "pollen",
    currency: "USD",
    gross_sales: 100,
    refunds: 0,
    reversals: 0,
    stripe_fees: 5,
    dispute_fees: 0,
    net_sales: 100,
    net_after_fees: 95,
    payments: 1,
    refund_count: 0,
    coverage_complete: 1,
};

describe("Runway source coverage", () => {
    it("keeps reviewed prepaid funding in cash without requiring same-month service costs", () => {
        const prepaid = bank({ category: "balance_sheet", amount: -100 });
        const laterPayment = bank({
            entry_id: "later-payment",
            date: "2026-10-01",
            amount: -50,
        });
        const result = buildRunway(
            [opening, prepaid, laterPayment],
            now,
            [vendor()],
            undefined,
            [sales],
        );
        const september = result.columns.find((c) => c.id === "2026-09:actual");
        expect(september?.provisional).toBe(false);
        expect(september?.runningCashUsd).toBe(9900);
        expect(result.currentCashUsd).toBe(9850);
        expect(
            result.rows.find((r) => r.category === "infrastructure")
                ?.actualIssues?.["2026-10:current"],
        ).toContain("Service-month costs unavailable");
        expect(
            result.rows.find((r) => r.category === "infrastructure")?.values[
                "2026-09:actual"
            ],
        ).toBeNull();
    });
    it("does not use an adjacent invoice as proof of September service cost", () => {
        const rows = [vendor()];
        const result = buildRunway([opening, bank()], now, rows, undefined, [
            sales,
        ]);
        expect(
            result.rows.find((row) => row.vendor === "tinybird")?.values[
                "2026-09:actual"
            ],
        ).toBeNull();
        expect(
            result.flags.some(
                (flag) => flag.includes("tinybird") && flag.includes("2026-09"),
            ),
        ).toBe(true);
        expect(
            result.columns.find((column) => column.id === "2026-09:actual")
                ?.totalExpensesUsd,
        ).toBeNull();
        expect(result.currentCashUsd).toBeCloseTo(9733.12);
        expect(
            providerCloseRows(
                { vendorLedger: rows, opTransactions: [bank()], opPollen: [] },
                "2026-10",
            ).find(
                (row) => row.vendor === "tinybird" && row.month === "2026-09",
            )?.closeStatus,
        ).not.toBe("ready");
    });
    it("allows an explicit supplier invoice match across payment and service months", () => {
        const matched = vendor({ evidence: invoice });
        expect(bankPaymentHasServiceEvidence(bank(), [matched])).toBe(true);
        const result = buildRunway(
            [opening, bank()],
            now,
            [matched],
            undefined,
            [sales],
        );
        expect(
            result.flags.some((flag) => flag.startsWith("Bank paid tinybird")),
        ).toBe(false);
        expect(
            result.rows.find((row) => row.vendor === "tinybird")?.values[
                "2026-09:actual"
            ],
        ).toBeNull();
        expect(
            result.rows.find((row) => row.vendor === "tinybird")?.values[
                "2026-08:actual"
            ],
        ).toBe(-218.56);
    });
    it("preserves explicit zero usage while empty actuals stay unknown and historical cash remains", () => {
        const rows = [
            vendor({
                start: "2026-09-01 00:00:00",
                end: "2026-10-01 00:00:00",
                paid: 0,
                credit: 0,
                resource_sku: "verified-zero",
                resource_count: 0,
            }),
        ];
        const result = buildRunway(
            [
                opening,
                bank({ vendor: "notion", category: "operations", amount: -20 }),
            ],
            now,
            rows,
            undefined,
            [sales],
        );
        expect(
            result.rows.find((row) => row.vendor === "tinybird")?.values[
                "2026-09:actual"
            ],
        ).toBe(0);
        expect(
            result.rows.find((row) => row.vendor === "tinybird")?.values[
                "2026-10:current"
            ],
        ).toBeNull();
        const october = result.columns.find(
            (column) => column.id === "2026-10:current",
        );
        expect(october?.netUsd).toBeNull();
        expect(october?.totalExpensesUsd).toBeNull();
        expect(october?.runningCashUsd).toBe(9980);
        expect(
            result.columns.find((column) => column.id === "2026-01:actual")
                ?.runningCashUsd,
        ).toBe(10000);
    });
    it("retains an approved zero forecast and its reviewed assumption", () => {
        const result = buildRunway(
            [opening],
            now,
            [],
            {
                "stripe refunds|revenue": {
                    fixedAmounts: [{ amount: 0, currency: "USD" }],
                },
            },
            [sales],
        );
        const refunds = result.rows.find(
            (row) => row.vendor === "stripe refunds",
        );
        expect(refunds?.values["2026-10:forecast"]).toBe(0);
        expect(refunds?.assumptions["2026-10:forecast"]?.[0].evidence).toBe(
            "Reviewed fixed amount",
        );
    });
});

describe("checked credit balance dates", () => {
    const funded = vendor({
        vendor: "fireworks",
        account_id: "neoglyph",
        type: "inference",
        start: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
        paid: 0,
        credit: -310,
        resource_id: "tokens",
    });
    const balance = vendor({
        entry_id: "balance",
        vendor: "fireworks",
        account_id: "neoglyph",
        type: "balance",
        start: "2026-10-16 00:00:00",
        end: "",
        paid: 0,
        credit: 310,
        resource_sku: "current-balance-expiry-assumed",
    });
    it("preserves recorded cash when a later provider balance lacks current-month usage", () => {
        const result = buildRunway(
            [opening],
            now,
            [funded, balance],
            undefined,
            [sales],
        );
        expect(result.currentCashUsd).toBe(10000);
        expect(
            result.columns.find((column) => column.id === "2026-10:current")
                ?.netUsd,
        ).toBeNull();
    });
    it("shows depletion for an agreed expiry assumption using the same calendar days", () => {
        const grant = vendor({
            entry_id: "grant",
            vendor: "fireworks",
            account_id: "neoglyph",
            type: "grant",
            start: "2026-09-01 00:00:00",
            end: "2028-01-01",
            paid: 0,
            credit: 1000,
        });
        const rows = providerAccountBalanceRows(
            { vendorLedger: [grant, funded, balance] },
            now,
        );
        expect(
            rows.find(
                (row) =>
                    row.vendor === "fireworks" && row.accountId === "neoglyph",
            ),
        ).toMatchObject({
            expiryAssumed: true,
            creditDepletionDate: "2026-11-16",
            creditDepletionReason: "burn",
        });
    });
});

it("does not count a credit award as recorded zero cost", () => {
    const result = buildRunway([opening], now, [
        vendor({
            vendor: "anthropic",
            type: "inference",
            start: "2026-10-14T00:00:00Z",
            end: "2026-11-09T00:00:00Z",
            paid: 0,
            credit: 500,
            resource_sku: "grant",
        }),
    ]);
    expect(
        result.columns.find((c) => c.id === "2026-10:current")
            ?.totalExpensesUsd,
    ).toBeNull();
    expect(
        result.rows.find((r) => r.vendor === "anthropic")?.values[
            "2026-10:current"
        ] ?? null,
    ).toBeNull();
});

it.each([
    "2026-10-01 00:00:00",
    "2026-10-01T00:00:00Z",
    "2026-10-01T00:00:00.000Z",
])("does not extend verified September zero usage past %s", (end) => {
    const result = buildRunway([opening], now, [
        vendor({
            start: "2026-09-01T00:00:00Z",
            end,
            paid: 0,
            credit: 0,
            resource_sku: "verified-zero",
            resource_count: 0,
        }),
    ]);
    const row = result.rows.find((r) => r.vendor === "tinybird");
    expect(row?.values["2026-09:actual"]).toBe(0);
    expect(row?.values["2026-10:current"]).toBeNull();
});
