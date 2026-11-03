import { describe, expect, it } from "vitest";
import type {
    OpTransactionRow,
    PrivateForecastRule,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import { monthShift } from "./months";
import { buildRunway as calculateRunway, pnlSource } from "./runway";

const NOW = new Date("2026-08-25T12:00:00.000Z");

// Historical scenarios explicitly select their review, rather than using
// the dashboard's September review selection.
const buildRunway = (
    transactions: OpTransactionRow[],
    now = NOW,
    rows: VendorLedgerRow[] = [],
    rules?: Readonly<Record<string, PrivateForecastRule>>,
    sales: readonly StripeSalesRow[] = [],
) =>
    calculateRunway(transactions, now, rows, rules, sales, {
        baselineMonth: monthShift(now.toISOString().slice(0, 7), -1),
        asOf: now.toISOString().slice(0, 10),
    });

const PRIVATE_RULES: Record<string, PrivateForecastRule> = {
    "deel|balance_sheet": {
        scheduledAmounts: [
            {
                month: "2026-08",
                amount: 100,
                currency: "EUR",
                note: "Example scheduled inflow",
            },
            {
                month: "2026-12",
                amount: 200,
                currency: "EUR",
                note: "Example later inflow",
            },
        ],
    },
    "deel|payroll": {
        fixedAmounts: [{ amount: -300, currency: "EUR" }],
        activeThrough: "2026-11",
    },
    "elevenlabs|compute": {
        fixedAmounts: [{ amount: -70, currency: "USD" }],
    },
    "enty|admin": {
        fixedAmounts: [{ amount: -80, currency: "EUR" }],
        activeThrough: "2026-12",
    },
    "openai|development": {
        fixedAmounts: [{ amount: -90, currency: "USD" }],
    },
    "replacement-accountant|admin": {
        fixedAmounts: [{ amount: -60, currency: "EUR" }],
        activeFrom: "2027-01",
    },
};

const transaction = (
    overrides: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-transaction",
    kind: "transaction",
    source: "wise",
    date: "2026-08-10",
    vendor: "google",
    category: "cloud",
    amount: -100,
    currency: "USD",
    description: "Google Cloud",
    evidence: "Wise statement",
    recorded_at: "2026-08-25 00:00:00.000",
    ...overrides,
});

const opening = (
    amount = 20_000,
    overrides: Partial<OpTransactionRow> = {},
): OpTransactionRow =>
    transaction({
        entry_id: "wise-opening-usd",
        kind: "opening_balance",
        date: "2026-01-01",
        vendor: "wise",
        category: "balance_sheet",
        amount,
        description: "Statement opening balance",
        ...overrides,
    });

const cloud = (overrides: Partial<VendorLedgerRow> = {}): VendorLedgerRow => ({
    entry_id: "cloud-usage",
    source: "dashboard",
    vendor: "google",
    type: "inference",
    start: "2026-08-01 00:00:00",
    end: "2026-08-23 00:00:00",
    credit: 0,
    paid: -220,
    currency: "USD",
    resource_id: "model",
    resource_name: "Model usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "gemini",
    evidence: "https://drive.google.com/file/d/provider-usage/view",
    recorded_at: "2026-08-22 00:00:00.000",
    ...overrides,
});

// Complete prior-month source for the monthly forecast contract.
const baseline = (overrides: Partial<VendorLedgerRow> = {}) =>
    cloud({
        entry_id: "baseline",
        start: "2026-07-01 00:00:00",
        end: "2026-08-01 00:00:00",
        paid: -310,
        evidence: "https://drive.google.com/file/d/verified-usage/view",
        ...overrides,
    });

const balance = (vendor: string, paid: number, credit = 0): VendorLedgerRow =>
    cloud({
        entry_id: `${vendor}-balance`,
        vendor,
        type: "balance",
        start: "2026-08-01 00:00:00",
        end: "",
        paid,
        credit,
        resource_id: "balance",
        resource_name: "Available balance",
        resource_sku: "current-balance",
        model: "",
        account_id:
            vendor === "xai"
                ? "ad7ac7e1-17f2-46e0-8dd2-7e99584f63e2"
                : undefined,
    });

const stripeSales = (
    overrides: Partial<StripeSalesRow> = {},
): StripeSalesRow => ({
    revenue_stream: "pollen",
    reversals: 0,
    coverage_complete: 1,
    month: "2026-07",
    currency: "USD",
    gross_sales: 120,
    refunds: 20,
    net_sales: 100,
    stripe_fees: 5,
    dispute_fees: 0,
    net_after_fees: 95,
    payments: 3,
    refund_count: 1,
    ...overrides,
});

describe("buildRunway", () => {
    it("forecasts bank fees without repeating a one-time API advance", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "api-advance",
                    vendor: "pollinations",
                    category: "revenue",
                    date: "2026-07-22",
                    amount: 7000,
                }),
                transaction({
                    entry_id: "bank-fee",
                    vendor: "wise",
                    category: "admin",
                    date: "2026-07-22",
                    amount: -4.49,
                }),
            ],
            NOW,
        );
        const advance = result.rows.find(
            (row) => row.vendor === "pollinations",
        );
        const fees = result.rows.find(
            (row) => row.vendor === "wise" && row.category === "admin",
        );
        expect(advance?.values["2026-07:actual"]).toBe(7000);
        expect(advance?.values["2026-09:forecast"]).toBe(0);
        expect(fees?.values["2026-09:forecast"]).toBe(-4.49);
        expect(result.flags.join(" ")).not.toContain(
            "Calculation mode missing",
        );
    });

    it("requires credit expiry before forecasting E2B cash", () => {
        const result = buildRunway(
            [opening()],
            new Date("2026-10-06T12:00:00Z"),
            [
                cloud({
                    vendor: "e2b",
                    account_id: "da33283c-f2bf-414e-87e3-ab8e20cffc46",
                    type: "infra",
                    start: "2026-09-01 00:00:00",
                    end: "2026-10-01 00:00:00",
                    paid: 0,
                    credit: -0.08,
                }),
                {
                    ...balance("e2b", 0, 25099.9),
                    account_id: "da33283c-f2bf-414e-87e3-ab8e20cffc46",
                    start: "2026-10-01 00:00:00",
                    recorded_at: "2026-10-02 00:00:00.000",
                },
            ],
        );
        expect(result.flags.join(" ")).toContain("credit expiry not verified");
        expect(result.flags.join(" ")).not.toContain(
            "Calculation mode missing",
        );
    });

    it("allocates reviewed rent to service months without moving cash or changing the plan", () => {
        const bank = [
            opening(),
            transaction({
                entry_id: "july-payment",
                vendor: "gaswerksiedlung",
                category: "office",
                date: "2026-07-08",
                amount: -900,
            }),
            transaction({
                entry_id: "september-payment",
                vendor: "gaswerksiedlung",
                category: "office",
                date: "2026-09-04",
                amount: -900,
            }),
            transaction({
                entry_id: "october-payment",
                vendor: "gaswerksiedlung",
                category: "office",
                date: "2026-10-05",
                amount: -900,
            }),
        ];
        const rules: Record<string, PrivateForecastRule> = {
            "gaswerksiedlung|office": {
                fixedAmounts: [{ amount: -400, currency: "USD" }],
                activeFrom: "2026-10",
            },
        };
        const now = new Date("2026-10-19T12:00:00Z");
        const baseline = buildRunway(bank, now, [], rules);
        const months = ["2026-06", "2026-08", "2026-09"];
        const allocated = bank.map((row, index) =>
            index === 0
                ? row
                : {
                      ...row,
                      evidence: `${row.evidence}; expense_month=${months[index - 1]}; reviewed`,
                  },
        );
        const result = buildRunway(allocated, now, [], rules);
        const rent = result.rows.find(
            (row) => row.vendor === "Rent & utilities",
        );
        if (!rent) throw new Error("Expected rent row");
        expect(rent.values["2026-06:actual"]).toBe(-900);
        expect(rent.values["2026-07:actual"]).toBe(0);
        expect(rent.values["2026-08:actual"]).toBe(-900);
        expect(rent.values["2026-09:actual"]).toBe(-900);
        expect(rent.values["2026-10:forecast"]).toBe(-400);
        expect(
            Object.entries(rent.values)
                .filter(([key]) => !key.endsWith(":forecast"))
                .reduce((sum, [, value]) => sum + (value ?? 0), 0),
        ).toBe(-2700);
        for (const column of result.columns) {
            const before = baseline.columns.find((c) => c.id === column.id);
            if (!before) throw new Error("Expected original column");
            expect(column.netUsd).toBe(before.netUsd);
            expect(column.runningCashUsd).toBe(before.runningCashUsd);
            if (column.kind === "forecast")
                expect(column.totalExpensesUsd).toBe(before.totalExpensesUsd);
        }
        expect(result.projectedMonthEndCashUsd).toBe(
            baseline.projectedMonthEndCashUsd,
        );
        expect(bank[1].evidence).toBe("Wise statement");
        const invalid = buildRunway(
            bank.map((row) => ({ ...row, evidence: "expense_month=2026-99" })),
            now,
            [],
            rules,
        );
        expect(invalid.rows).toEqual(baseline.rows);
    });

    it("keeps a one-month rent amount separate from later fixed rent and electricity", () => {
        const now = new Date("2026-09-05T12:00:00Z");
        const bank = [
            opening(),
            transaction({
                entry_id: "old-rent",
                vendor: "gaswerksiedlung",
                category: "office",
                amount: -900,
                currency: "EUR",
                date: "2026-06-03",
            }),
            transaction({
                entry_id: "electricity",
                vendor: "naturenergie",
                category: "office",
                amount: -25,
                currency: "EUR",
                date: "2026-08-06",
            }),
            transaction({
                entry_id: "old-subscription",
                vendor: "openai",
                category: "development",
                description: "ChatGPT subscription",
                amount: -90,
                date: "2026-08-07",
            }),
        ];
        const rules: Record<string, PrivateForecastRule> = {
            "gaswerksiedlung|office": {
                scheduledAmounts: [
                    {
                        month: "2026-09",
                        amount: -1000,
                        currency: "EUR",
                        note: "Example first month",
                    },
                ],
                fixedAmounts: [{ amount: -400, currency: "EUR" }],
                activeFrom: "2026-10",
            },
            "openai|development": {
                fixedAmounts: [{ amount: -160, currency: "USD" }],
                activeFrom: "2026-09",
            },
        };
        const baseline = buildRunway(bank, now);
        const updated = buildRunway(bank, now, [], rules);
        const rent = updated.rows.find(
            (row) => row.vendor === "Rent & utilities",
        );
        expect(rent?.forecastMethod).toBe("mixed");
        expect(rent?.forecastIssue).toBeUndefined();
        const component = (month: string, vendor: string) =>
            rent?.assumptions[`${month}:forecast`]
                ?.filter((a) => a.vendor === vendor)
                .reduce((sum, a) => sum + a.amount, 0);
        expect(component("2026-09", "gaswerksiedlung")).toBe(-1000);
        expect(component("2026-10", "gaswerksiedlung")).toBe(-400);
        expect(component("2027-12", "gaswerksiedlung")).toBe(-400);
        expect(component("2026-09", "naturenergie")).toBe(-25);
        expect(component("2026-10", "naturenergie")).toBe(-25);
        expect(
            baseline.assumptions.some((a) => a.vendor === "gaswerksiedlung"),
        ).toBe(false);
        expect(
            updated.rows.find(
                (row) =>
                    row.vendor === "openai" && row.category === "development",
            )?.values["2026-09:forecast"],
        ).toBe(-160);
        for (const month of ["2026-06", "2026-07", "2026-08"]) {
            expect(
                updated.columns.find((c) => c.id === `${month}:actual`),
            ).toEqual(baseline.columns.find((c) => c.id === `${month}:actual`));
        }
    });

    it("keeps overdue scheduled amounts unresolved until explicitly linked to Bank", () => {
        const september = new Date("2026-09-04T12:00:00Z");
        const result = buildRunway([opening()], september, [], PRIVATE_RULES);
        expect(
            result.flags.some((flag) => flag.includes("overdue or unmatched")),
        ).toBe(true);
        const settlement = transaction({
            entry_id: "refund",
            vendor: "deel",
            category: "balance_sheet",
            amount: 100,
            currency: "EUR",
            date: "2026-09-02",
        });
        const rules = {
            "deel|balance_sheet": {
                scheduledAmounts: [
                    {
                        month: "2026-08",
                        amount: 100,
                        currency: "EUR" as const,
                        note: "Refund",
                        settledByEntryIds: ["refund"],
                    },
                ],
            },
        };
        const settled = buildRunway(
            [opening(), settlement],
            september,
            [],
            rules,
        );
        expect(
            settled.flags.some(
                (flag) =>
                    flag.includes("overdue") ||
                    flag.includes("settlement links"),
            ),
        ).toBe(false);
        expect(
            settled.rows.find((row) => row.vendor === "deel")?.values[
                "2026-09:current"
            ],
        ).toBeGreaterThan(0);
        expect(settled.assumptions.some((row) => row.vendor === "deel")).toBe(
            false,
        );
        const wrong = buildRunway(
            [opening(), { ...settlement, amount: 90 }],
            september,
            [],
            rules,
        );
        expect(
            wrong.flags.some((flag) =>
                flag.includes("invalid settlement links"),
            ),
        ).toBe(true);
    });

    it("explains revenue to cash with settlements, payments, deposits and FX without counting provider credits", () => {
        const bank = [
            opening(1000),
            opening(100, { entry_id: "eur-opening", currency: "EUR" }),
            transaction({
                entry_id: "payout",
                date: "2026-07-20",
                vendor: "stripe",
                category: "revenue",
                amount: 150,
            }),
            transaction({
                entry_id: "payment",
                date: "2026-07-20",
                amount: -40,
            }),
            transaction({
                entry_id: "deposit-return",
                date: "2026-07-20",
                vendor: "deel",
                category: "balance_sheet",
                amount: 100,
            }),
        ];
        const result = buildRunway(
            bank,
            NOW,
            [baseline({ paid: -30, credit: -500 })],
            undefined,
            [stripeSales()],
        );
        const july = result.columns.find((c) => c.id === "2026-07:actual");
        if (!july?.cashBridge || july.netUsd == null)
            throw new Error("July cash bridge missing");
        expect(july.cashBridge).toMatchObject({
            revenue: 95,
            expenses: -30,
            receiptsDifference: 55,
            paymentsDifference: -10,
            otherCash: 100,
        });
        expect(july.cashBridge?.exchangeRates).toBeCloseTo(-1.01, 8);
        expect(
            Object.values(july.cashBridge).reduce(
                (sum, value) => sum + value,
                0,
            ),
        ).toBeCloseTo(july.netUsd, 8);
        expect(july.netUsd).toBeCloseTo(208.99, 8);
        expect(july.totalCreditUsd).toBe(-500);
        expect(
            result.columns
                .filter((c) => c.kind === "forecast")
                .every((c) => c.cashBridge === undefined),
        ).toBe(true);
        const missingSales = buildRunway(bank, NOW, [baseline({ paid: -30 })]);
        expect(
            missingSales.columns.find((c) => c.id === july.id)?.cashBridge,
        ).toBeUndefined();
    });

    it("bridges Stripe activity to bank payouts without changing sales or cash", () => {
        const result = buildRunway(
            [
                opening(1000),
                transaction({
                    date: "2026-07-20",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 80,
                }),
            ],
            NOW,
            [],
            undefined,
            [stripeSales()],
        );
        const july = result.columns.find(
            (column) => column.id === "2026-07:actual",
        );
        if (!july) throw new Error("July column missing");
        // Revenue is known; this fixture has no expense coverage.
        expect(july.operatingResultUsd).toBeNull();
        expect(july.cashBridge).toBeUndefined();
        // Revenue is what entered Stripe in the month; the Wise payout is
        // cash only, so no settlement line bridges the two.
        expect(
            result.rows.some(
                (row) => row.vendor === "processor settlement timing",
            ),
        ).toBe(false);
        expect(july.netUsd).toBe(80);
        expect(result.currentCashUsd).toBe(1080);
        expect(
            result.assumptions.find((row) => row.vendor === "stripe sales")
                ?.evidence,
        ).toContain("Stripe activity");
    });
    it("reconstructs cash from the statement opening balance and movements", () => {
        const result = buildRunway(
            [opening(1_000), transaction({ amount: -100 })],
            NOW,
        );

        expect(result.currentCashUsd).toBe(900);
        expect(result.openingBalanceUsd).toBe(1_000);
    });

    it("rolls older currency anchors forward to the latest opening date", () => {
        const result = buildRunway(
            [
                opening(100, { entry_id: "eur-opening", currency: "EUR" }),
                transaction({
                    entry_id: "eur-august",
                    date: "2026-08-31",
                    currency: "EUR",
                    amount: -100,
                }),
                opening(30, {
                    entry_id: "usd-opening",
                    date: "2026-09-01",
                }),
                transaction({
                    entry_id: "usd-september",
                    date: "2026-09-10",
                    amount: -10,
                }),
            ],
            new Date("2026-09-15T12:00:00.000Z"),
        );

        expect(result.openingBalanceDate).toBe("2026-09-01");
        expect(result.openingBalanceUsd).toBe(30);
        expect(result.currentCashUsd).toBe(20);
    });

    it("preserves cash history when a later currency opening confirms recorded movements", () => {
        const transactions = [
            opening(100, { entry_id: "eur-opening", currency: "EUR" }),
            transaction({
                entry_id: "eur-spend",
                date: "2026-08-31",
                currency: "EUR",
                amount: -100,
            }),
            transaction({
                entry_id: "usd-receipt",
                date: "2026-08-31",
                amount: 80,
            }),
            transaction({
                entry_id: "usd-spend",
                date: "2026-09-10",
                amount: -10,
            }),
        ];
        const now = new Date("2026-09-15T12:00:00.000Z");
        const original = buildRunway(transactions, now);
        const checkpoint = opening(80, {
            entry_id: "usd-opening",
            date: "2026-09-01",
        });
        const confirmed = buildRunway([...transactions, checkpoint], now);
        expect(confirmed.openingBalanceDate).toBe("2026-01-01");
        expect(confirmed.currentCashUsd).toBe(70);
        expect(
            confirmed.columns
                .filter((column) => column.month < "2026-09")
                .map((column) => column.runningCashUsd),
        ).toEqual(
            original.columns
                .filter((column) => column.month < "2026-09")
                .map((column) => column.runningCashUsd),
        );
        const different = buildRunway(
            [...transactions, { ...checkpoint, amount: 80.01 }],
            now,
        );
        expect(different.openingBalanceDate).toBe("2026-09-01");
        expect(different.currentCashUsd).toBeCloseTo(70.01, 8);
    });

    it("keeps cash unavailable for conflicting anchors in one currency", () => {
        const result = buildRunway(
            [
                opening(100),
                opening(30, { entry_id: "later", date: "2026-09-01" }),
            ],
            new Date("2026-09-15T12:00:00.000Z"),
        );

        expect(result.currentCashUsd).toBeNull();
        expect(result.flags.join(" ")).toContain(
            "Conflicting opening-balance dates for USD",
        );
    });

    it("uses Stripe sales for P&L revenue and Wise payouts for cash", () => {
        const result = buildRunway(
            [
                opening(1_000),
                transaction({
                    entry_id: "stripe-payout",
                    date: "2026-07-20",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 80,
                }),
            ],
            NOW,
            [],
            undefined,
            [stripeSales()],
        );
        const stripeSalesRow = result.rows.find(
            (row) =>
                row.vendor === "stripe sales" && row.category === "revenue",
        );
        const stripeRefundsRow = result.rows.find(
            (row) =>
                row.vendor === "stripe refunds" && row.category === "revenue",
        );
        const stripeFees = result.rows.find(
            (row) => row.vendor === "stripe fees",
        );
        const july = result.columns.find(
            (column) => column.id === "2026-07:actual",
        );

        expect(stripeSalesRow?.values["2026-07:actual"]).toBe(115);
        expect(stripeSalesRow?.values["2026-09:forecast"]).toBe(115);
        expect(stripeRefundsRow?.values["2026-07:actual"]).toBe(-20);
        expect(stripeRefundsRow?.values["2026-09:forecast"]).toBe(-20);
        // Fees live inside the net sales figure, never as an expense line.
        expect(stripeFees).toBeUndefined();
        expect(july?.netUsd).toBe(80);
        expect(result.currentCashUsd).toBe(1_080);
    });

    it("nets Pollen and Ko-fi sales after fees on one line and refunds with reversals on another", () => {
        const result = buildRunway(
            [
                opening(1000),
                transaction({
                    date: "2026-07-20",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 80,
                }),
            ],
            NOW,
            [],
            undefined,
            [
                stripeSales({
                    reversals: 10,
                    net_sales: 90,
                    net_after_fees: 85,
                }),
                stripeSales({
                    revenue_stream: "kofi",
                    gross_sales: 20,
                    refunds: 0,
                    net_sales: 20,
                    stripe_fees: 2,
                    dispute_fees: 0,
                    net_after_fees: 18,
                    payments: 1,
                    refund_count: 0,
                }),
            ],
        );
        const value = (vendor: string, column = "2026-07:actual") =>
            result.rows.find((row) => row.vendor === vendor)?.values[column];
        // Pollen and Ko-fi net of fees on one line; refunds and reversals on
        // the other. Both project at the last reviewed month.
        expect(value("stripe sales")).toBe(133);
        expect(value("stripe refunds")).toBe(-30);
        expect(value("stripe fees")).toBeUndefined();
        expect(value("stripe sales", "2026-09:forecast")).toBe(133);
        expect(value("stripe refunds", "2026-09:forecast")).toBe(-30);
        expect(
            result.columns.find((column) => column.id === "2026-07:actual")
                ?.operatingResultUsd,
        ).toBeNull(); // No expense coverage in this sales-only fixture.
        expect(result.currentCashUsd).toBe(1080);
    });

    it("keeps returned dispute fees with recovered chargebacks, including a fee-only recovery", () => {
        for (const recoveredPrincipal of [0, 20]) {
            const result = buildRunway([opening(1000)], NOW, [], undefined, [
                stripeSales(),
                stripeSales({
                    month: "2026-06",
                    gross_sales: 0,
                    refunds: 0,
                    reversals: -recoveredPrincipal,
                    net_sales: recoveredPrincipal,
                    stripe_fees: -60,
                    dispute_fees: -60,
                    net_after_fees: recoveredPrincipal + 60,
                    payments: 0,
                    refund_count: 0,
                }),
            ]);
            const rows = result.rows.filter(
                (row) => row.category === "revenue",
            );
            const details = rows.flatMap((row) => row.details ?? []);
            const amount = (label: string) =>
                details.find((row) => row.label === label)?.values[
                    "2026-06:actual"
                ];
            expect(amount("Stripe fees")).toBe(0);
            expect(
                rows.find((row) => row.vendor === "stripe refunds")?.values[
                    "2026-06:actual"
                ],
            ).toBe(recoveredPrincipal + 60);
            expect(
                rows.reduce(
                    (sum, row) => sum + (row.values["2026-06:actual"] ?? 0),
                    0,
                ),
            ).toBe(recoveredPrincipal + 60);
            expect(result.currentCashUsd).toBe(1000);
        }
    });

    it("accepts refunded Stripe fees without changing cash or later forecasts", () => {
        const baseline = buildRunway([opening(1000)], NOW, [], undefined, [
            stripeSales(),
        ]);
        const result = buildRunway([opening(1000)], NOW, [], undefined, [
            stripeSales(),
            stripeSales({
                month: "2026-06",
                gross_sales: 0,
                refunds: 0,
                net_sales: 0,
                stripe_fees: -5,
                dispute_fees: 0,
                net_after_fees: 5,
                payments: 0,
                refund_count: 0,
            }),
        ]);
        expect(
            result.rows.find((row) => row.vendor === "stripe sales")?.values[
                "2026-06:actual"
            ],
        ).toBe(5);
        expect(result.flags.some((flag) => flag.includes("invalid"))).toBe(
            false,
        );
        expect(result.currentCashUsd).toBe(baseline.currentCashUsd);
        expect(result.projectedMonthEndCashUsd).toBe(
            baseline.projectedMonthEndCashUsd,
        );
        expect(result.assumptions).toEqual(baseline.assumptions);
    });

    it("never falls back from missing Stripe sales to Wise payouts", () => {
        const result = buildRunway(
            [
                opening(1_000),
                transaction({
                    entry_id: "stripe-payout",
                    date: "2026-07-20",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 80,
                }),
            ],
            NOW,
        );

        expect(result.rows.some((row) => row.vendor.startsWith("stripe"))).toBe(
            false,
        );
        expect(result.flags).toContain(
            "Stripe sales are missing; Stripe P&L revenue and its forecast are unavailable. Wise payouts remain included in cash.",
        );
        expect(
            result.columns.find((column) => column.id === "2026-07:actual")
                ?.netUsd,
        ).toBe(80);
    });

    it("rejects stale Stripe sales rather than forecasting from old data", () => {
        const result = buildRunway(
            [
                opening(1_000),
                transaction({
                    entry_id: "stripe-payout",
                    date: "2026-07-20",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 80,
                }),
            ],
            NOW,
            [],
            undefined,
            [stripeSales({ month: "2026-06" })],
        );

        expect(
            result.rows.find((row) => row.vendor === "stripe sales")?.values[
                "2026-06:actual"
            ],
        ).toBe(115);
        expect(
            result.assumptions.some((row) => row.vendor === "stripe sales"),
        ).toBe(false);
        expect(result.flags).toContain(
            "Stripe collection is not verified complete for 2026-07; its forecast is unavailable. Recorded sales and Wise cash remain visible.",
        );
    });

    it("does not turn a partial Stripe month into a completed baseline after rollover", () => {
        const result = buildRunway(
            [opening()],
            new Date("2026-10-01T12:00:00Z"),
            [],
            undefined,
            [
                stripeSales({
                    month: "2026-08",
                    gross_sales: 1000,
                    net_sales: 980,
                    net_after_fees: 975,
                }),
                stripeSales({ month: "2026-09", coverage_complete: 0 }),
            ],
        );
        expect(
            result.rows.find((row) => row.vendor === "stripe sales")?.values[
                "2026-08:actual"
            ],
        ).toBe(995);
        expect(
            result.rows.find((row) => row.vendor === "stripe sales")?.values[
                "2026-09:actual"
            ],
        ).toBe(115);
        expect(
            result.assumptions.some((row) => row.vendor === "stripe sales"),
        ).toBe(false);
        expect(
            result.flags.some((flag) =>
                flag.includes("not verified complete for 2026-09"),
            ),
        ).toBe(true);
        expect(result.projectedMonthEndCashUsd).toBeNull();
    });

    it("derives fixed subscriptions from reviewed rules, not forecast rows", () => {
        const result = buildRunway([opening()], NOW, [], PRIVATE_RULES);
        const openai = result.rows.find(
            (row) => row.vendor === "openai" && row.category === "development",
        );

        expect(openai?.values["2026-08:forecast"]).toBe(-90);
        expect(openai?.values["2027-01:forecast"]).toBe(-90);
        expect(openai?.values["2027-12:forecast"]).toBe(-90);
        expect(result.columns.at(-1)?.month).toBe("2027-12");
        expect(openai?.forecastMethod).toBe("fixed");
    });

    it("keeps ElevenLabs at its fixed subscription instead of metered usage", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    vendor: "elevenlabs",
                    category: "compute",
                    amount: -299,
                }),
            ],
            NOW,
            [
                cloud({
                    vendor: "elevenlabs",
                    paid: -142.19,
                    recorded_at: "2026-08-22 00:00:00.000",
                }),
            ],
            PRIVATE_RULES,
        );
        const elevenlabs = result.rows.find(
            (row) => row.vendor === "elevenlabs" && row.category === "compute",
        );

        expect(elevenlabs?.values["2026-08:forecast"]).toBe(-70);
        expect(elevenlabs?.values["2026-09:forecast"]).toBe(-70);
        expect(elevenlabs?.forecastMethod).toBe("fixed");
        expect(elevenlabs?.forecastPaymentTiming).toBe("direct");
    });

    it("derives run-rate lines from the latest completed bank month", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "github-june",
                    date: "2026-06-02",
                    vendor: "github",
                    category: "development",
                    amount: -100,
                }),
                transaction({
                    entry_id: "github-july",
                    date: "2026-07-02",
                    vendor: "github",
                    category: "development",
                    amount: -200,
                }),
            ],
            NOW,
        );
        const github = result.rows.find(
            (row) => row.vendor === "github" && row.category === "development",
        );

        expect(github?.values["2026-09:forecast"]).toBe(-200);
        expect(
            github?.assumptions["2026-09:forecast"]?.[0]?.evidence,
        ).toContain("2026-07");
    });

    it("does not repeat a stale currency after a billing-currency switch", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "github-may-eur",
                    date: "2026-05-02",
                    vendor: "github",
                    category: "development",
                    amount: -147.81,
                    currency: "EUR",
                }),
                transaction({
                    entry_id: "github-july-usd",
                    date: "2026-07-02",
                    vendor: "github",
                    category: "development",
                    amount: -189,
                    currency: "USD",
                }),
            ],
            NOW,
        );
        const github = result.rows.find(
            (row) => row.vendor === "github" && row.category === "development",
        );

        expect(github?.values["2026-09:forecast"]).toBe(-189);
        expect(github?.assumptions["2026-09:forecast"]).toHaveLength(1);
        expect(github?.assumptions["2026-09:forecast"]?.[0]).toMatchObject({
            currency: "USD",
            amount: -189,
        });
    });

    it("keeps multiple currencies when both occur in the latest month", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "github-july-eur",
                    date: "2026-07-02",
                    vendor: "github",
                    category: "development",
                    amount: -100,
                    currency: "EUR",
                }),
                transaction({
                    entry_id: "github-july-usd",
                    date: "2026-07-03",
                    vendor: "github",
                    category: "development",
                    amount: -50,
                    currency: "USD",
                }),
            ],
            NOW,
        );
        const github = result.rows.find(
            (row) => row.vendor === "github" && row.category === "development",
        );

        expect(github?.values["2026-09:forecast"]).toBeCloseTo(
            -100 * 1.1513 - 50,
            6,
        );
        expect(github?.assumptions["2026-09:forecast"]).toHaveLength(2);
    });

    it("keeps only reviewed scheduled events and lifecycle boundaries", () => {
        const result = buildRunway([opening()], NOW, [], PRIVATE_RULES);
        const refund = result.rows.find(
            (row) => row.vendor === "deel" && row.category === "balance_sheet",
        );
        const payroll = result.rows.find(
            (row) => row.vendor === "deel" && row.category === "payroll",
        );
        const accounting = result.rows.find(
            (row) => row.vendor === "Accounting & filings",
        );
        const replacement = result.rows.find(
            (row) => row.vendor === "replacement-accountant",
        );

        expect(refund?.values["2026-08:forecast"]).toBeCloseTo(100 * 1.1593, 2);
        expect(refund?.values["2026-12:forecast"]).toBeCloseTo(200 * 1.1513, 2);
        expect(payroll?.values["2026-11:forecast"]).toBeLessThan(0);
        expect(payroll?.values["2026-12:forecast"]).toBe(0);
        expect(accounting?.values["2026-12:forecast"]).toBeLessThan(0);
        expect(accounting?.values["2027-01:forecast"]).toBe(0);
        expect(replacement?.values["2027-01:forecast"]).toBeLessThan(0);
    });

    it("uses the complete prior month, not the partial current month's rate", () => {
        const result = buildRunway([opening(), transaction()], NOW, [
            baseline({ paid: -620 }),
            cloud(),
            { ...balance("google", 0), start: "2026-08-01 00:00:00" },
        ]);
        const row = result.rows.find((r) => r.vendor === "google");
        expect(row?.values["2026-08:forecast"]).toBe(-620);
        // A full baseline month, independent of partial current usage.
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-620);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-620);
        expect(row?.forecastPaymentTiming).toBe("postpaid");
    });

    it("does not substitute partial usage or ingestion dates for a complete baseline", () => {
        const result = buildRunway([opening()], NOW, [
            cloud(),
            balance("google", 0),
        ]);
        expect(
            result.rows.find((r) => r.vendor === "google")?.forecastIssue,
        ).toContain("complete 2026-07 usage is missing");
    });

    it("treats a verified zero baseline differently from missing usage", () => {
        const result = buildRunway([opening()], NOW, [
            baseline({ paid: 0 }),
            balance("google", 0),
        ]);
        const row = result.rows.find((r) => r.vendor === "google");
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.values["2026-09:forecast"]).toBe(0);
    });

    it("uses prepaid cash once before forecasting new bank payments", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    vendor: "replicate",
                    category: "compute",
                    amount: -50,
                }),
            ],
            NOW,
            [
                baseline({ vendor: "replicate" }),
                cloud({ vendor: "replicate" }),
                { ...balance("replicate", 10), start: "2026-08-01 00:00:00" },
            ],
        );
        const row = result.rows.find((r) => r.vendor === "replicate");
        // The full 310 budget uses 10 prepaid; the recorded payment is not added.
        expect(row?.values["2026-08:forecast"]).toBeCloseTo(-300);
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-310);
        expect(row?.creditValues?.["2026-09:forecast"]).toBeUndefined();
        expect(result.currentCashUsd).toBe(19950);
    });

    it("pins monthly spending across imports and flags calendar rollover for review", () => {
        const now = new Date("2026-10-18T12:00:00Z");
        const reviewed = [
            baseline({
                vendor: "replicate",
                start: "2026-09-01 00:00:00",
                end: "2026-10-01 00:00:00",
                paid: -300,
            }),
            { ...balance("replicate", 100), start: "2026-10-01 00:00:00" },
        ];
        const sales = [stripeSales({ month: "2026-09" })];
        const before = calculateRunway(
            [opening()],
            now,
            reviewed,
            undefined,
            sales,
        );
        const after = calculateRunway(
            [
                opening(),
                transaction({
                    date: "2026-10-16",
                    amount: -500,
                    vendor: "replicate",
                }),
                transaction({
                    entry_id: "new",
                    date: "2026-10-17",
                    vendor: "new vendor",
                    amount: -10,
                }),
            ],
            now,
            [
                ...reviewed,
                cloud({
                    vendor: "replicate",
                    start: "2026-10-01 00:00:00",
                    end: "2026-10-18 00:00:00",
                    paid: -9999,
                }),
                {
                    ...balance("replicate", 9999),
                    entry_id: "later-balance",
                    start: "2026-10-19 00:00:00",
                    recorded_at: "2026-10-19",
                },
            ],
            undefined,
            [
                ...sales,
                stripeSales({
                    month: "2026-10",
                    gross_sales: 9999,
                    coverage_complete: 0,
                }),
            ],
        );
        expect(after.columns.filter((c) => c.kind === "forecast")).toEqual(
            before.columns.filter((c) => c.kind === "forecast"),
        );
        expect(after.currentCashUsd).toBe((before.currentCashUsd ?? 0) - 510);
        expect(after.projectedMonthEndCashUsd).toBe(
            before.projectedMonthEndCashUsd,
        );
        expect(
            before.rows.find((r) => r.vendor === "replicate")?.values[
                "2026-10:forecast"
            ],
        ).toBeCloseTo(-200);
        const november = calculateRunway(
            [opening()],
            new Date("2026-11-02T12:00:00Z"),
            reviewed,
            undefined,
            sales,
        );
        expect(
            november.rows.find((row) => row.vendor === "replicate")?.values[
                "2026-11:forecast"
            ],
        ).toBe(
            before.rows.find((row) => row.vendor === "replicate")?.values[
                "2026-11:forecast"
            ],
        );
        expect(november.projectedMonthEndCashUsd).toBeNull();
        expect(november.runwayMonths).toBeNull();
        expect(november.flags.join(" ")).toContain(
            "Plan baseline 2026-09 needs review",
        );
    });

    it("uses one fixed override instead of also projecting metered usage", () => {
        const result = buildRunway(
            [opening()],
            NOW,
            [baseline({ vendor: "replicate" }), balance("replicate", 100)],
            {
                "replicate|compute": {
                    fixedAmounts: [{ amount: -75, currency: "USD" }],
                },
            },
        );
        const row = result.rows.find((r) => r.vendor === "replicate");
        expect(row?.values["2026-08:forecast"]).toBe(-75);
        expect(row?.values["2026-09:forecast"]).toBe(-75);
        expect(row?.assumptions["2026-08:forecast"]).toHaveLength(1);
        expect(row?.forecastMethod).toBe("fixed");
        expect(row?.creditValues?.["2026-08:forecast"]).toBeUndefined();
        expect(row?.values["2026-07:actual"]).toBe(-310);
    });

    it("keeps provider accounts separate when forecasting cash and credits", () => {
        const result = buildRunway([opening()], NOW, [
            baseline({ vendor: "openrouter", account_id: "myceli" }),
            baseline({
                vendor: "openrouter",
                account_id: "pollinations",
                entry_id: "other",
            }),
            {
                ...balance("openrouter", 1000),
                account_id: "myceli",
                start: "2026-08-01 00:00:00",
            },
            {
                ...balance("openrouter", 0),
                account_id: "pollinations",
                entry_id: "other-balance",
                start: "2026-08-01 00:00:00",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "openrouter");
        expect(row?.values["2026-08:forecast"]).toBeCloseTo(-310);
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-310);
    });

    it("keeps a reviewed plan unchanged by a later prepaid payment", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    vendor: "replicate",
                    category: "compute",
                    date: "2026-08-24",
                    amount: -100,
                }),
            ],
            NOW,
            [
                baseline({ vendor: "replicate" }),
                { ...balance("replicate", 10), start: "2026-08-01 00:00:00" },
            ],
        );
        expect(
            result.rows.find((r) => r.vendor === "replicate")?.forecastIssue,
        ).toBeUndefined();
        expect(
            result.rows.find((r) => r.vendor === "replicate")?.values[
                "2026-08:forecast"
            ],
        ).toBeCloseTo(-300);
        expect(result.currentCashUsd).toBe(19900);
        expect(result.projectedMonthEndCashUsd).toBeCloseTo(19700);
    });

    it("budgets full months without requiring partial current-month usage", () => {
        const result = buildRunway(
            [opening()],
            NOW,
            [
                baseline({ vendor: "openai", paid: 0, credit: -310 }),
                {
                    ...balance("openai", 0, 1000),
                    start: "2026-08-01 00:00:00",
                    end: "2027-12-31 23:59:59",
                },
            ],
            PRIVATE_RULES,
        );
        const row = result.rows.find(
            (r) => r.vendor === "openai" && r.category === "compute",
        );
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.values["2026-08:forecast"]).toBe(0);
        expect(row?.creditValues?.["2026-08:forecast"]).toBeCloseTo(-310);
        expect(row?.values["2026-09:forecast"]).toBe(0);
        expect(row?.creditValues?.["2026-09:forecast"]).toBeCloseTo(-310);
        expect(
            result.rows.find(
                (r) => r.vendor === "openai" && r.category === "development",
            )?.values["2026-08:forecast"],
        ).toBe(-90);
        expect(result.projectedMonthEndCashUsd).toBeCloseTo(
            20000 +
                (result.columns.find(
                    (column) => column.id === "2026-08:forecast",
                )?.netUsd ?? NaN),
        );
    });

    it("estimates the baseline split until credit terms support depletion", () => {
        const usage = baseline({ vendor: "fal", paid: 0, credit: -310 });
        const snapshot = {
            ...balance("fal", 0, 1000),
            start: "2026-08-01 00:00:00",
        };
        const provisional = buildRunway([opening()], NOW, [usage, snapshot]);
        expect(provisional.flags.join(" ")).toContain("expiry not verified");
        expect(provisional.fundingProvisional).toBe(true);
        expect(
            provisional.rows.find((r) => r.vendor === "fal")?.creditValues?.[
                "2026-09:forecast"
            ],
        ).toBe(-310);
        expect(provisional.projectedMonthEndCashUsd).toBe(20000);
        const result = buildRunway([opening()], NOW, [
            usage,
            { ...snapshot, end: "2026-09-15 23:59:59" },
        ]);
        const row = result.rows.find((r) => r.vendor === "fal");
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-155);
        expect(row?.creditValues?.["2026-09:forecast"]).toBeCloseTo(-155);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-310);
        expect(row?.creditValues?.["2026-10:forecast"]).toBeUndefined();
    });

    it("honors an explicit snapshot expiry assumption", () => {
        const result = buildRunway([opening()], NOW, [
            baseline({ vendor: "fal", paid: 0, credit: -310 }),
            {
                ...balance("fal", 0, 1000),
                start: "2026-08-01 00:00:00",
                resource_sku: "current-balance-expiry-assumed",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "fal");
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.values["2026-09:forecast"]).toBe(0);
        expect(row?.creditValues?.["2026-09:forecast"]).toBeCloseTo(-310);
        expect(row?.values["2026-12:forecast"]).toBeLessThan(0);
    });

    it("keeps separate credit lots until their own expiry", () => {
        const snapshot = {
            ...balance("fal", 0, 1000),
            start: "2026-08-01 00:00:00",
            resource_sku: "current-balance-lot",
        };
        const result = buildRunway([opening()], NOW, [
            baseline({ vendor: "fal", paid: 0, credit: -310 }),
            {
                ...snapshot,
                entry_id: "early",
                resource_id: "early",
                end: "2026-09-15",
            },
            {
                ...snapshot,
                entry_id: "later",
                resource_id: "later",
                end: "2026-10-15",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "fal");
        expect(row?.values["2026-09:forecast"]).toBe(0);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-160);
        expect(row?.creditValues?.["2026-10:forecast"]).toBeCloseTo(-150);
    });

    it("does not block a current account forecast on unrelated historical account IDs", () => {
        const current = baseline({ vendor: "vast", account_id: "myceli" });
        const checked = { ...balance("vast", 1000), account_id: "myceli" };
        const historical = cloud({
            vendor: "vast",
            account_id: "old-unmapped",
            start: "2026-01-01 00:00:00",
            end: "2026-02-01 00:00:00",
        });
        const result = buildRunway([opening()], NOW, [
            historical,
            current,
            checked,
        ]);
        expect(result.flags.some((flag) => flag.includes("unrecognized"))).toBe(
            false,
        );
        expect(
            result.rows.find((row) => row.vendor === "vast")?.forecastIssue,
        ).toBeUndefined();
        const unresolved = buildRunway([opening()], NOW, [
            { ...historical, start: current.start, end: current.end },
            current,
            checked,
        ]);
        expect(
            unresolved.flags.some((flag) => flag.includes("unrecognized")),
        ).toBe(true);
    });

    it("keeps discounted GitHub infrastructure funded but flags new paid usage", () => {
        const usage = cloud({
            vendor: "github",
            type: "infra",
            start: "2026-07-01 00:00:00",
            end: "2026-08-01 00:00:00",
            paid: 0,
            credit: -500,
        });
        const funded = buildRunway([opening()], NOW, [usage], undefined, [
            stripeSales(),
        ]);
        const row = funded.rows.find((r) => r.vendor === "github");
        expect(row?.forecastMethod).toBe("funded");
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.creditValues?.["2026-07:actual"]).toBe(-500);
        expect(row?.values["2026-08:forecast"]).toBe(0);
        expect(funded.flags.some((flag) => flag.includes("github"))).toBe(
            false,
        );

        expect(funded.projectedMonthEndCashUsd).not.toBeNull();
        const paid = buildRunway(
            [opening()],
            NOW,
            [{ ...usage, paid: -10, credit: -490 }],
            undefined,
            [stripeSales()],
        );
        expect(paid.projectedMonthEndCashUsd).toBeNull();
        expect(
            paid.columns
                .filter((c) => c.kind === "forecast")
                .every((c) => c.forecastComplete === false),
        ).toBe(true);
        expect(paid.flags).toContain(
            "github (infrastructure) has recent cash-funded usage; review its funded forecast before relying on zero future cash cost.",
        );
        expect(
            paid.rows.find((r) => r.vendor === "github")?.forecastIssue,
        ).toBe("Paid usage conflicts with the funded forecast");
    });

    it("includes a pending postpaid bill as an explicit estimate without blocking later months", () => {
        const result = buildRunway(
            [opening()],
            NOW,
            [
                cloud({
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                }),
                { ...balance("google", 0), start: "2026-08-01 00:00:00" },
            ],
            undefined,
            [stripeSales()],
        );
        const google = result.rows.find((r) => r.vendor === "google");
        expect(google?.forecastIssue).toBeUndefined();
        expect(google?.values["2026-08:forecast"]).toBe(-700);
        expect(google?.values["2026-09:forecast"]).toBeCloseTo(-700, 8);
        expect(google?.forecastMethod).toBe("last");
        expect(google?.assumptions["2026-08:forecast"][0].evidence).toContain(
            "Estimated 2026-07 postpaid bill from recorded cash-funded usage",
        );
        expect(result.billingNotices).toContain(
            "google (compute): 2026-08 includes the estimated settlement for 2026-07 cash-funded usage.",
        );
        expect(
            result.flags.some((flag) => flag.includes("estimated $700")),
        ).toBe(false);
        for (const month of ["2026-08", "2026-09"]) {
            expect(
                result.columns.find((c) => c.id === `${month}:forecast`)
                    ?.forecastComplete,
            ).toBe(true);
        }
        expect(result.currentCashUsd).toBe(20000);
        expect(result.projectedMonthEndCashUsd).toBe(19395);
        expect(result.runwayMonths).not.toBeNull();
    });

    it("explains settlement timing without claiming the supplier invoice is missing", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                start: "2026-07-01 00:00:00",
                end: "2026-08-01 00:00:00",
                paid: -0.02,
                source: "invoice",
                evidence:
                    "https://drive.google.com/file/d/supplier-invoice/view; paid in August",
            }),
        ]);
        expect(result.billingNotices).toEqual([
            "google (compute): 2026-08 includes the estimated settlement for 2026-07 cash-funded usage.",
        ]);
        expect(result.billingNotices.join(" ")).not.toMatch(
            /awaiting|pending|missing/i,
        );
    });

    it.each([0, 250, 700, 900].map((paid) => ({ paid })))(
        "keeps the same full-month plan with $paid of current-month payments",
        ({ paid }) => {
            const result = buildRunway(
                [opening(), ...(paid ? [transaction({ amount: -paid })] : [])],
                NOW,
                [
                    cloud({
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                        paid: -700,
                    }),
                    { ...balance("google", 0), start: "2026-08-01 00:00:00" },
                ],
                undefined,
                [stripeSales()],
            );
            const google = result.rows.find((r) => r.vendor === "google");
            expect(google?.values["2026-08:forecast"]).toBe(-700);
            expect(google?.values["2026-09:forecast"]).toBeCloseTo(-700, 8);
            expect(result.currentCashUsd).toBe(20000 - paid);
            expect(
                result.columns.find(
                    (column) => column.id === "2026-08:forecast",
                )?.netUsd,
            ).toBe(95 - 700);
            expect(result.projectedMonthEndCashUsd).toBe(20095 - 700);
        },
    );

    it("keeps the shared postpaid budget independent of actual settlements", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({ entry_id: "first", amount: -250 }),
                transaction({ entry_id: "second", amount: -480 }),
            ],
            NOW,
            [
                cloud({
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                    credit: -100,
                }),
                cloud({
                    entry_id: "infra",
                    type: "infrastructure",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -30,
                }),
                { ...balance("google", 0), start: "2026-08-01 00:00:00" },
            ],
            undefined,
            [stripeSales()],
        );
        const google = result.rows.filter((r) => r.vendor === "google");
        expect(google).toHaveLength(2);
        expect(
            google.reduce(
                (sum, r) => sum + (r.values["2026-08:forecast"] ?? Number.NaN),
                0,
            ),
        ).toBe(-730);
        expect(
            result.columns.find((column) => column.id === "2026-08:forecast")
                ?.netUsd,
        ).toBe(95 - 730);
        expect(result.currentCashUsd).toBe(19270);
        expect(result.projectedMonthEndCashUsd).toBe(19365);
    });

    it("does not offset another vendor's payment against a pending bill", () => {
        const result = buildRunway(
            [opening(), transaction({ vendor: "xai", amount: -100 })],
            NOW,
            [
                cloud({
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                }),
                { ...balance("google", 0), start: "2026-08-01 00:00:00" },
            ],
            undefined,
            [stripeSales()],
        );
        expect(
            result.columns.find((column) => column.id === "2026-08:forecast")
                ?.netUsd,
        ).toBe(-605);
        expect(result.projectedMonthEndCashUsd).toBe(19395);
    });

    it("replaces the opening bill with the next period's usage at rollover", () => {
        const result = buildRunway(
            [opening()],
            new Date("2026-09-05T12:00:00Z"),
            [
                cloud({
                    entry_id: "july",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                }),
                cloud({ end: "2026-09-01 00:00:00", paid: -80 }),
                {
                    ...{
                        ...balance("google", 0),
                        start: "2026-08-01 00:00:00",
                    },
                    start: "2026-09-01 00:00:00",
                },
            ],
            undefined,
            [stripeSales({ month: "2026-08" })],
        );
        const google = result.rows.find((r) => r.vendor === "google");
        expect(google?.values["2026-09:forecast"]).toBe(-80);
        expect(google?.values["2026-10:forecast"]).toBe(-80);
        expect(result.currentCashUsd).toBe(20000);
        expect(result.projectedMonthEndCashUsd).toBe(20015);
    });

    it("does not use import timestamps as usage coverage", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({ vendor: "fal", end: "" }),
            balance("fal", 0),
        ]);
        expect(
            result.rows.find((r) => r.vendor === "fal")?.forecastIssue,
        ).toContain("complete 2026-07 usage is missing");
    });

    it("does not forecast stopped RunPod usage", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "runpod-july-topup",
                    date: "2026-07-09",
                    vendor: "runpod",
                    category: "compute",
                    amount: -300,
                }),
            ],
            NOW,
            [
                cloud({
                    vendor: "runpod",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -616,
                    recorded_at: "2026-08-22 00:00:00.000",
                }),
                balance("runpod", 4.76),
            ],
            PRIVATE_RULES,
        );
        const runpod = result.rows.find((row) => row.vendor === "runpod");

        expect(runpod?.values["2026-08:forecast"]).toBe(0);
        expect(runpod?.values["2026-09:forecast"]).toBe(0);
        expect(runpod?.forecastMethod).toBe("one_off");
    });

    it("keeps a provisional cash budget without a checked balance", () => {
        const result = buildRunway([opening()], NOW, [
            baseline({ vendor: "vast", type: "gpu" }),
        ]);

        expect(result.flags).toContain(
            "vast: checked account balance missing; funding depletion is unverified; the plan provisionally repeats the baseline cash/credit split.",
        );
    });

    it("keeps one-time historical services out of future months", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "notion-history",
                    date: "2026-05-01",
                    vendor: "notion",
                    category: "operations",
                    amount: -46,
                }),
            ],
            NOW,
            [],
            PRIVATE_RULES,
        );
        const notion = result.rows.find((row) => row.vendor === "notion");

        expect(notion?.values["2026-09:forecast"]).toBe(0);
        expect(notion?.forecastMethod).toBe("one_off");
    });

    it("shows creator payouts as one-time Revenue Share expenses", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "llm7-settlement",
                    date: "2026-08-10",
                    vendor: "llm7.io",
                    category: "creator_payout",
                    amount: -100,
                    description: "Creator payout",
                }),
            ],
            NOW,
            [],
            PRIVATE_RULES,
        );
        const settlement = result.rows.find(
            (row) =>
                row.vendor === "llm7.io" && row.category === "revenue_share",
        );

        expect(settlement?.values["2026-08:current"]).toBe(-100);
        expect(settlement?.values["2026-09:forecast"]).toBe(0);
        expect(settlement?.forecastMethod).toBe("one_off");
        expect(result.flags.join(" ")).not.toContain("llm7.io");
    });

    it("keeps cash unavailable for unsupported currencies", () => {
        const result = buildRunway(
            [opening(), transaction({ currency: "GBP" })],
            NOW,
            [cloud(), balance("google", 0)],
        );

        expect(result.currentCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "1 bank row uses unsupported currency (GBP); cash balance and runway are unavailable.",
        );
    });
});

describe("ledger-based P&L categories", () => {
    it("builds Compute and Infrastructure actuals from the vendor ledger, not from bank payments", () => {
        const result = buildRunway(
            [
                opening(10_000),
                transaction({
                    entry_id: "aws-payment",
                    date: "2026-08-15",
                    vendor: "aws",
                    category: "cloud",
                    amount: -1_000,
                    description: "AUTOMAT-IT",
                }),
            ],
            NOW,
            [
                cloud({
                    entry_id: "aws-july-inference",
                    vendor: "aws",
                    type: "inference",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                }),
                cloud({
                    entry_id: "aws-july-guardrails",
                    vendor: "aws",
                    type: "infra",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: 0,
                    credit: -300,
                }),
            ],
        );
        const compute = result.rows.find(
            (row) => row.category === "compute" && row.vendor === "aws",
        );
        const infrastructure = result.rows.find(
            (row) => row.category === "infrastructure" && row.vendor === "aws",
        );
        const timing = result.rows.find(
            (row) => row.vendor === "vendor invoice timing",
        );
        const credits = result.rows.find(
            (row) => row.vendor === "credit-funded usage",
        );
        const july = result.columns.find(
            (column) => column.id === "2026-07:actual",
        );
        const august = result.columns.find(
            (column) => column.id === "2026-08:current",
        );

        expect(compute?.values["2026-07:actual"]).toBe(-700);
        expect(compute?.values["2026-08:current"]).toBeNull();
        // Credit-funded usage stays beside the cash figure, never inside it.
        expect(infrastructure?.values["2026-07:actual"]).toBe(0);
        expect(infrastructure?.creditValues?.["2026-07:actual"]).toBe(-300);
        expect(july?.totalExpensesUsd).toBe(-700);
        expect(july?.totalCreditUsd).toBe(-300);
        // No bridge line: Cash change stays the bank movement (see netUsd).
        expect(timing).toBeUndefined();
        expect(credits).toBeUndefined();
        expect(august?.netUsd).toBe(-1_000);
        expect(result.currentCashUsd).toBe(9_000);
    });

    it("does not warn when a bank payment is still held as cash prepaid on the vendor balance", () => {
        const topUp = transaction({
            entry_id: "stability-topup",
            date: "2026-06-10",
            vendor: "stability",
            category: "compute",
            amount: -30,
            description: "Stability AI credits",
        });
        const held = buildRunway([opening(1_000), topUp], NOW, [
            balance("stability", 30, 8.95),
        ]);
        const spent = buildRunway([opening(1_000), topUp], NOW, [
            balance("stability", 5, 8.95),
        ]);

        expect(held.flags.some((flag) => /stability/.test(flag))).toBe(false);
        expect(held.rows.some((row) => row.vendor === "stability")).toBe(false);
        expect(held.currentCashUsd).toBe(970);
        expect(
            spent.flags.some(
                (flag) => /stability/.test(flag) && /ledger/.test(flag),
            ),
        ).toBe(true);
    });

    it("keeps cash-only vendor movements in cash without a table line", () => {
        const result = buildRunway(
            [
                opening(1_000),
                transaction({
                    entry_id: "thomas-2025-scaleway",
                    date: "2026-07-09",
                    vendor: "thomas-haferlach",
                    category: "balance_sheet",
                    amount: -100,
                    description: "Reimbursement for 2025 Scaleway invoices",
                }),
            ],
            NOW,
            [],
        );

        expect(
            result.rows.some((row) => row.vendor === "thomas-haferlach"),
        ).toBe(false);
        expect(result.currentCashUsd).toBe(900);
        expect(result.flags.some((flag) => /thomas/.test(flag))).toBe(false);
    });

    it("warns instead of falling back to bank cash when a ledger category vendor has no invoices", () => {
        const result = buildRunway(
            [
                opening(1_000),
                transaction({
                    entry_id: "retell-card",
                    date: "2026-07-03",
                    vendor: "retell",
                    category: "saas",
                    amount: -50,
                    description: "Retell AI",
                }),
                transaction({
                    entry_id: "notion-card",
                    date: "2026-07-03",
                    vendor: "notion",
                    category: "saas",
                    amount: -20,
                    description: "Notion",
                }),
            ],
            NOW,
            [],
        );
        const retell = result.rows.find(
            (row) => row.category === "compute" && row.vendor === "retell",
        );
        const notion = result.rows.find(
            (row) => row.category === "operations" && row.vendor === "notion",
        );

        expect(retell?.values["2026-07:actual"] ?? 0).toBe(0);
        expect(retell?.actualIssues?.["2026-07:actual"]).toContain(
            "Service-month costs unavailable",
        );
        expect(retell?.forecastIssue).toBeUndefined();
        expect(
            result.flags.some(
                (flag) => /retell/.test(flag) && /ledger/.test(flag),
            ),
        ).toBe(true);
        expect(notion?.values["2026-07:actual"]).toBe(-20);
        expect(result.currentCashUsd).toBe(930);
    });

    it("warns about paid months the vendor ledger does not cover", () => {
        const result = buildRunway(
            [
                opening(5_000),
                ...["2026-05-19", "2026-06-19", "2026-07-19"].map((date) =>
                    transaction({
                        entry_id: `tinybird-${date}`,
                        date,
                        vendor: "tinybird",
                        category: "cloud",
                        amount: -40,
                        description: "Tinybird",
                    }),
                ),
            ],
            NOW,
            [
                cloud({
                    entry_id: "tinybird-july",
                    vendor: "tinybird",
                    type: "infra",
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -40,
                    model: "",
                    resource_name: "Build plan",
                }),
            ],
        );
        const tinybird = result.rows.find(
            (row) =>
                row.category === "infrastructure" && row.vendor === "tinybird",
        );

        expect(tinybird?.values["2026-07:actual"]).toBe(-40);
        expect(tinybird?.values["2026-05:actual"]).toBeNull();
        expect(
            result.flags.some(
                (flag) =>
                    /tinybird/.test(flag) &&
                    /2026-05/.test(flag) &&
                    /ledger/.test(flag),
            ),
        ).toBe(true);
        // An adjacent month's costs do not identify the invoice June paid.
        expect(
            result.flags.some(
                (flag) => /tinybird/.test(flag) && /2026-06/.test(flag),
            ),
        ).toBe(true);
    });

    it("does not assume credit-funded usage can never need cash", () => {
        const result = buildRunway([opening(5_000)], NOW, [
            cloud({
                entry_id: "unreviewed-july-credit",
                vendor: "unreviewed-provider",
                type: "inference",
                start: "2026-07-01 00:00:00",
                end: "2026-08-01 00:00:00",
                paid: 0,
                credit: -500,
            }),
        ]);
        const row = result.rows.find(
            (row) => row.vendor === "unreviewed-provider",
        );

        expect(row?.values["2026-07:actual"]).toBe(0);
        expect(row?.creditValues?.["2026-07:actual"]).toBe(-500);
        expect(row?.forecastIssue).toBe("Calculation mode missing");
        expect(
            result.flags.some(
                (flag) =>
                    /Calculation mode missing/.test(flag) &&
                    /unreviewed-provider/.test(flag),
            ),
        ).toBe(true);
        expect(
            result.columns
                .filter((column) => column.kind === "forecast")
                .every((column) => column.forecastComplete === false),
        ).toBe(true);
    });

    it.each(["assemblyai", "openai"])(
        "budgets continued %s API usage after prepaid credit runs out",
        (vendor) => {
            const result = buildRunway([opening()], NOW, [
                baseline({ vendor, paid: 0, credit: -310 }),
                cloud({ vendor, paid: 0, credit: -220 }),
                {
                    ...balance(vendor, 0, 100),
                    start: "2026-08-01 00:00:00",
                    end: "2027-12-31",
                },
            ]);
            const row = result.rows.find(
                (row) => row.vendor === vendor && row.category === "compute",
            );
            // Each full-month budget is 310; the 100 reviewed credits are used once.
            expect(row?.forecastMethod).toBe("last");
            expect(row?.forecastPaymentTiming).toBe("prepaid");
            expect(row?.forecastIssue).toBeUndefined();
            expect(row?.values["2026-08:forecast"]).toBeCloseTo(-210);
            expect(row?.values["2026-09:forecast"]).toBeCloseTo(-310);
            expect(row?.values["2026-10:forecast"]).toBeCloseTo(-310);
        },
    );

    it("budgets OVH compute and infrastructure against one shared credit balance", () => {
        const result = buildRunway([opening()], NOW, [
            baseline({ vendor: "ovhcloud", paid: 0, credit: -310 }),
            baseline({
                vendor: "ovhcloud",
                entry_id: "baseline-infra",
                type: "infra",
                paid: 0,
                credit: -155,
            }),
            cloud({
                entry_id: "ovh-compute",
                vendor: "ovhcloud",
                paid: 0,
                credit: -220,
            }),
            cloud({
                entry_id: "ovh-infra",
                vendor: "ovhcloud",
                type: "infra",
                paid: 0,
                credit: -110,
            }),
            {
                ...balance("ovhcloud", 0, 150),
                start: "2026-08-01 00:00:00",
                end: "2027-12-31",
            },
        ]);
        const rows = result.rows.filter((row) => row.vendor === "ovhcloud");
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.forecastMethod).toBe("last");
            expect(row.forecastPaymentTiming).toBe("postpaid");
            expect(row.forecastIssue).toBeUndefined();
        }
        const cash = (month: string) =>
            rows.reduce(
                (sum, row) => sum + (row.values[`${month}:forecast`] ?? 0),
                0,
            );
        // Shared 465/month budget uses 150 credits once, leaving 315 payable next month.
        expect(cash("2026-09")).toBeCloseTo(-315);
        expect(cash("2026-10")).toBeCloseTo(-465);
        expect(cash("2026-11")).toBeCloseTo(-465);
    });

    it("classifies subscription invoices in the ledger through the vendor registry", () => {
        const result = buildRunway([opening(1_000)], NOW, [
            cloud({
                entry_id: "github-july",
                vendor: "github",
                type: "subscription",
                start: "2026-07-01 00:00:00",
                end: "2026-08-01 00:00:00",
                paid: -40,
                model: "",
                resource_name: "GitHub Enterprise Cloud",
            }),
        ]);
        const github = result.rows.find(
            (row) => row.category === "development" && row.vendor === "github",
        );
        // Development is still bank-based, so a ledger row is not a P&L line yet.
        expect(github).toBeUndefined();
        expect(pnlSource("development")).toBe("bank");
        expect(pnlSource("compute")).toBe("ledger");
        expect(pnlSource("infrastructure")).toBe("ledger");
    });
});

it("keeps recorded Ko-fi sales separate from the reviewed plan after shutdown", () => {
    const sale = (overrides: Partial<StripeSalesRow>) =>
        stripeSales({
            month: "2026-09",
            currency: "USD",
            gross_sales: 100,
            refunds: 0,
            reversals: 0,
            stripe_fees: 5,
            dispute_fees: 0,
            net_sales: 100,
            net_after_fees: 95,
            coverage_complete: 1,
            ...overrides,
        });
    const result = buildRunway(
        [opening(1000)],
        new Date("2026-10-16T12:00:00Z"),
        [],
        {
            "stripe sales|revenue": {
                salesStoppedFrom: { kofi: "2026-10-16" },
            },
        },
        [
            sale({}),
            sale({
                revenue_stream: "kofi",
                gross_sales: 20,
                stripe_fees: 2,
                dispute_fees: 0,
                net_sales: 20,
                net_after_fees: 18,
            }),
            sale({
                revenue_stream: "kofi",
                month: "2026-10",
                gross_sales: 5,
                stripe_fees: 1,
                dispute_fees: 0,
                net_sales: 5,
                net_after_fees: 4,
                coverage_complete: 0,
            }),
        ],
    );
    const row = result.rows.find((row) => row.vendor === "stripe sales");
    if (!row) throw new Error("Missing Stripe sales row");
    expect(row.values["2026-09:actual"]).toBe(113);
    expect(row.values["2026-10:current"]).toBe(4);
    expect(row.values["2026-10:forecast"]).toBe(95);
    expect(row.values["2026-11:forecast"]).toBe(95);
    expect(
        row.details?.find((row) => row.label === "Gross customer payments")
            ?.values["2026-10:forecast"],
    ).toBe(100);
    expect(
        row.details?.find((row) => row.label === "Stripe fees")?.values[
            "2026-10:forecast"
        ],
    ).toBe(-5);
});

describe("monthly plan review regressions", () => {
    it("never replaces intervening closed cash movements with old plans", () => {
        const bank = [
            opening(),
            ...[
                ["2026-09-15", -100],
                ["2026-10-15", -5000],
                ["2026-11-15", -5000],
            ].map(([date, amount]) =>
                transaction({
                    entry_id: String(date),
                    date: String(date),
                    amount: Number(amount),
                    vendor: "investment",
                    category: "balance_sheet",
                }),
            ),
        ];
        const rules = {
            "elevenlabs|compute": {
                fixedAmounts: [{ amount: -100, currency: "USD" as const }],
            },
        };
        const now = new Date("2026-12-10T12:00:00Z");
        const stale = calculateRunway(bank, now, [], rules);
        expect(
            stale.columns.find((column) => column.id === "2026-11:actual")
                ?.runningCashUsd,
        ).toBe(9900);
        expect(stale.projectedMonthEndCashUsd).toBeNull();
        expect(stale.runwayMonths).toBeNull();
        expect(stale.flags.join(" ")).toContain("close 2026-11");
        expect(
            stale.columns
                .filter((column) => column.kind === "forecast")
                .every((column) => !column.forecastComplete),
        ).toBe(true);
        const review = { baselineMonth: "2026-11", asOf: "2026-12-10" };
        const renewed = calculateRunway(bank, now, [], rules, [], review);
        expect(renewed.projectedMonthEndCashUsd).toBe(9800);
        const live = calculateRunway(
            [...bank, transaction({ date: "2026-12-09", amount: -999 })],
            now,
            [],
            rules,
            [],
            review,
        );
        expect(live.currentCashUsd).toBe(8901);
        expect(live.projectedMonthEndCashUsd).toBe(9800);
        expect(
            live.columns.filter((column) => column.kind === "forecast"),
        ).toEqual(
            renewed.columns.filter((column) => column.kind === "forecast"),
        );
    });

    it("flags a newly used vendor with no baseline instead of assuming zero", () => {
        const result = calculateRunway(
            [opening()],
            new Date("2026-10-18T12:00:00Z"),
            [
                cloud({
                    vendor: "replicate",
                    paid: -400,
                    start: "2026-10-01 00:00:00",
                    end: "2026-10-18 00:00:00",
                }),
            ],
        );
        expect(
            result.rows.find((row) => row.vendor === "replicate")
                ?.forecastIssue,
        ).toContain("complete 2026-09 usage is missing");
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(
            result.columns
                .filter((column) => column.kind === "forecast")
                .every((column) => !column.forecastComplete),
        ).toBe(true);
    });

    it("requires a rule for an unknown balance-sheet movement", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    date: "2026-07-15",
                    vendor: "unknown-liability",
                    category: "balance_sheet",
                    amount: -400,
                }),
            ],
            NOW,
            [],
            PRIVATE_RULES,
        );
        expect(
            result.rows.find((row) => row.vendor === "unknown-liability")
                ?.forecastIssue,
        ).toBe("Calculation mode missing");
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
    });

    it.each(["fal", "google"])(
        "keeps %s prepaid/postpaid estimates independent of current Wise and later funding",
        (vendor) => {
            const usage = baseline({ vendor, paid: -100, credit: -210 });
            const plan = buildRunway([opening()], NOW, [usage]);
            const changed = buildRunway(
                [opening(), transaction({ vendor, amount: -900 })],
                NOW,
                [
                    usage,
                    {
                        ...balance(vendor, 500, 1000),
                        start: "2026-08-18 00:00:00",
                        end: "2027-12-31",
                    },
                ],
            );
            for (const result of [plan, changed]) {
                const row = result.rows.find((row) => row.vendor === vendor);
                for (const month of ["2026-08", "2026-09", "2026-10"]) {
                    expect(row?.values[`${month}:forecast`]).toBe(-100);
                    expect(row?.creditValues?.[`${month}:forecast`]).toBe(-210);
                }
                expect(result.fundingProvisional).toBe(true);
                expect(result.projectedMonthEndCashUsd).toBe(19900);
                expect(result.runwayMonths).not.toBeNull();
            }
            expect(
                changed.columns.filter((c) => c.kind === "forecast"),
            ).toEqual(plan.columns.filter((c) => c.kind === "forecast"));
            expect(changed.currentCashUsd).toBe(19100);
        },
    );

    it("never spends a full month twice against a mid-month credit snapshot", () => {
        const usage = baseline({ vendor: "fal", paid: 0, credit: -310 });
        const late = {
            ...balance("fal", 0, 100),
            start: "2026-08-18 00:00:00",
            end: "2027-12-31",
        };
        const incomplete = buildRunway([opening()], NOW, [usage, late]);
        const row = incomplete.rows.find((row) => row.vendor === "fal");
        expect(row?.forecastIssue).toBeUndefined();
        expect(incomplete.flags.join(" ")).toContain(
            "opening balance for 2026-08-01 is missing (balance checked 2026-08-18)",
        );
        expect(incomplete.fundingProvisional).toBe(true);
        expect(incomplete.projectedMonthEndCashUsd).toBe(20000);
        expect(incomplete.runwayMonths).not.toBeNull();
        expect(row?.values["2026-08:forecast"]).toBe(0);
        expect(row?.creditValues?.["2026-08:forecast"]).toBe(-310);
        expect(row?.creditValues?.["2026-09:forecast"]).toBe(-310);
        expect(row?.assumptions["2026-08:forecast"]?.[0].evidence).toContain(
            "provisional baseline cash/credit split",
        );
        const openingBalance = {
            ...late,
            entry_id: "opening-funding",
            start: "2026-08-01 00:00:00",
            credit: 410,
        };
        const plan = buildRunway([opening()], NOW, [usage, openingBalance]);
        const withLaterSnapshot = buildRunway([opening()], NOW, [
            usage,
            openingBalance,
            late,
        ]);
        const planned = withLaterSnapshot.rows.find(
            (row) => row.vendor === "fal",
        );
        expect(planned?.forecastIssue).toBeUndefined();
        expect(planned?.creditValues?.["2026-08:forecast"]).toBeCloseTo(-310);
        expect(planned?.creditValues?.["2026-09:forecast"]).toBeCloseTo(-100);
        expect(planned?.values["2026-09:forecast"]).toBeCloseTo(-210);
        expect(
            withLaterSnapshot.columns.filter(
                (column) => column.kind === "forecast",
            ),
        ).toEqual(plan.columns.filter((column) => column.kind === "forecast"));
        expect(
            withLaterSnapshot.rows.find((row) => row.vendor === "fal")?.values[
                "2026-07:actual"
            ],
        ).toBe(0);
        expect(
            withLaterSnapshot.rows.find((row) => row.vendor === "fal")
                ?.creditValues?.["2026-07:actual"],
        ).toBe(-310);
    });
});
