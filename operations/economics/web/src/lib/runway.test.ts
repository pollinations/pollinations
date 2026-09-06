import { describe, expect, it } from "vitest";
import type {
    OpCloudRow,
    OpTransactionRow,
    PrivateForecastRule,
    StripeSalesRow,
} from "../types";
import { buildRunway, pnlSource } from "./runway";

const NOW = new Date("2026-08-25T12:00:00.000Z");

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

const cloud = (overrides: Partial<OpCloudRow> = {}): OpCloudRow => ({
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
    evidence: "Provider dashboard",
    recorded_at: "2026-08-22 00:00:00.000",
    ...overrides,
});

const balance = (vendor: string, paid: number, credit = 0): OpCloudRow =>
    cloud({
        entry_id: `${vendor}-balance`,
        vendor,
        type: "balance",
        start: "2026-08-22 00:00:00",
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
    net_after_fees: 95,
    payments: 3,
    refund_count: 1,
    ...overrides,
});

describe("buildRunway", () => {
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
        expect(july.operatingResultUsd).toBe(95);
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
        ).toBe(103);
        expect(result.currentCashUsd).toBe(1080);
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
            -100 * 1.1593 - 50,
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
        expect(refund?.values["2026-12:forecast"]).toBeCloseTo(200 * 1.1593, 2);
        expect(payroll?.values["2026-11:forecast"]).toBeLessThan(0);
        expect(payroll?.values["2026-12:forecast"]).toBe(0);
        expect(accounting?.values["2026-12:forecast"]).toBeLessThan(0);
        expect(accounting?.values["2027-01:forecast"]).toBe(0);
        expect(replacement?.values["2027-01:forecast"]).toBeLessThan(0);
    });

    it("forecasts the full current-month postpaid liability next month", () => {
        const result = buildRunway([opening(), transaction()], NOW, [
            cloud(),
            balance("google", 0),
        ]);
        const google = result.rows.find(
            (row) => row.vendor === "google" && row.category === "compute",
        );

        expect(google?.values["2026-08:forecast"]).toBe(-100);
        expect(google?.values["2026-09:forecast"]).toBeCloseTo(-310, 6);
        expect(google?.values["2026-10:forecast"]).toBeCloseTo(-310, 6);
        expect(google?.forecastPaymentTiming).toBe("postpaid");
    });

    it("uses the usage boundary instead of a later ingestion date", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                vendor: "xai",
                paid: -200,
                end: "2026-08-21 00:00:00",
                recorded_at: "2026-08-25 00:00:00.000",
            }),
            balance("xai", 0),
        ]);
        const xai = result.rows.find((row) => row.vendor === "xai");

        expect(xai?.values["2026-09:forecast"]).toBeCloseTo(-310, 6);
    });

    it("treats xAI as postpaid when its checked balance is zero", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                vendor: "xai",
                paid: -79.852586,
                recorded_at: "2026-08-22 00:00:00.000",
            }),
            balance("xai", 0),
        ]);
        const xai = result.rows.find((row) => row.vendor === "xai");

        expect(xai?.values["2026-09:forecast"]).toBeCloseTo(-112.519553, 5);
        expect(xai?.forecastPaymentTiming).toBe("postpaid");
    });

    it("uses a checked prepaid balance before forecasting a top-up", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                vendor: "fal",
                paid: -57.73,
                recorded_at: "2026-08-22 00:00:00.000",
            }),
            balance("fal", 97.16),
        ]);
        const fal = result.rows.find((row) => row.vendor === "fal");

        expect(fal?.values["2026-09:forecast"]).toBeCloseTo(-7.8, 1);
        expect(fal?.values["2026-10:forecast"]).toBeCloseTo(-81.35, 1);
        expect(fal?.forecastPaymentTiming).toBe("prepaid");
    });

    it("forecasts only the uncovered current-month prepaid shortfall", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "replicate-august-topup",
                    vendor: "replicate",
                    category: "compute",
                    amount: -50,
                }),
            ],
            NOW,
            [
                cloud({
                    vendor: "replicate",
                    paid: -220,
                    recorded_at: "2026-08-22 00:00:00.000",
                }),
                balance("replicate", 10),
            ],
        );
        const replicate = result.rows.find(
            (row) => row.vendor === "replicate" && row.category === "compute",
        );

        // $220 through August 22 projects to $310 for the month. The remaining
        // $90 first consumes the $10 checked balance, leaving an $80 shortfall.
        expect(replicate?.values["2026-08:forecast"]).toBeCloseTo(-130, 6);
        expect(replicate?.values["2026-09:forecast"]).toBeCloseTo(-310, 6);
        expect(replicate?.assumptions["2026-08:forecast"]).toHaveLength(2);
        expect(
            replicate?.assumptions["2026-08:forecast"]?.map(
                (assumption) => assumption.amount,
            ),
        ).toEqual([-80, -50]);
    });

    it("does not pool prepaid cash between two provider accounts", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                vendor: "openrouter",
                account_id: "myceli",
                entry_id: "usage-a",
            }),
            cloud({
                vendor: "openrouter",
                account_id: "pollinations",
                entry_id: "usage-b",
            }),
            {
                ...balance("openrouter", 1000),
                account_id: "myceli",
                entry_id: "balance-a",
            },
            {
                ...balance("openrouter", 0),
                account_id: "pollinations",
                entry_id: "balance-b",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "openrouter");
        // Both spend 310/month. Account A's 1,000 cannot cover account B.
        expect(row?.values["2026-08:forecast"]).toBeCloseTo(-90);
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-310);
    });

    it("requires verified credit terms and stops credit coverage at expiry", () => {
        const usage = cloud({ vendor: "fal", paid: 0, credit: -220 });
        const unknown = buildRunway([opening()], NOW, [
            usage,
            balance("fal", 0, 1000),
        ]);
        expect(
            unknown.rows.find((r) => r.vendor === "fal")?.forecastIssue,
        ).toContain("expiry not verified");
        const expiring = buildRunway([opening()], NOW, [
            usage,
            { ...balance("fal", 0, 1000), end: "2026-09-15 23:59:59" },
        ]);
        const row = expiring.rows.find((r) => r.vendor === "fal");
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-155);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-310);
    });

    it("forecasts with an explicit snapshot-scoped expiry assumption, not an implicit fallback", () => {
        const usage = cloud({ vendor: "fal", paid: 0, credit: -220 });
        const result = buildRunway([opening()], NOW, [
            usage,
            {
                ...balance("fal", 0, 1000),
                resource_sku: "current-balance-expiry-assumed",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "fal");
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.values["2026-09:forecast"]).toBe(0);
        expect(row?.values["2026-12:forecast"]).toBeLessThan(0);
    });

    it("does not expire an entire account at its first lot's expiry", () => {
        const usage = cloud({ vendor: "fal", paid: 0, credit: -220 });
        const base = {
            ...balance("fal", 0, 1000),
            resource_sku: "current-balance-lot",
        };
        const result = buildRunway([opening()], NOW, [
            usage,
            {
                ...base,
                entry_id: "lot-early",
                resource_id: "early",
                end: "2026-09-15",
            },
            {
                ...base,
                entry_id: "lot-later",
                resource_id: "later",
                end: "2026-10-15",
            },
        ]);
        const row = result.rows.find((r) => r.vendor === "fal");
        expect(row?.values["2026-09:forecast"]).toBe(0);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-160);
        expect(row?.values["2026-11:forecast"]).toBeCloseTo(-310);
    });

    it("does not block a current account forecast on unrelated historical account IDs", () => {
        const current = cloud({ vendor: "vast.ai", account_id: "myceli" });
        const checked = { ...balance("vast.ai", 1000), account_id: "myceli" };
        const historical = cloud({
            vendor: "vast.ai",
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
            result.rows.find((row) => row.vendor === "vast.ai")?.forecastIssue,
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
                balance("google", 0),
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
        expect(result.flags).toContain(
            "google (compute): 2026-08 includes an estimated $700 bill for 2026-07 usage, less payments recorded this month. Invoice reconciliation pending.",
        );
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

    it.each(
        [0, 250, 700, 900].map((paid) => ({ paid })),
    )("offsets $paid of current-month payments against the estimated bill exactly once", ({
        paid,
    }) => {
        const result = buildRunway(
            [opening(), ...(paid ? [transaction({ amount: -paid })] : [])],
            NOW,
            [
                cloud({
                    start: "2026-07-01 00:00:00",
                    end: "2026-08-01 00:00:00",
                    paid: -700,
                }),
                balance("google", 0),
            ],
            undefined,
            [stripeSales()],
        );
        const google = result.rows.find((r) => r.vendor === "google");
        expect(google?.values["2026-08:forecast"]).toBe(-Math.max(paid, 700));
        expect(google?.values["2026-09:forecast"]).toBeCloseTo(-700, 8);
        expect(result.currentCashUsd).toBe(20000 - paid);
        expect(result.remainingCurrentPlanUsd).toBe(
            95 - Math.max(0, 700 - paid),
        );
        expect(result.projectedMonthEndCashUsd).toBe(
            20095 - Math.max(700, paid),
        );
    });

    it("matches payments once across a postpaid vendor's categories without consuming promotional credits", () => {
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
                balance("google", 0),
            ],
            undefined,
            [stripeSales()],
        );
        const google = result.rows.filter((r) => r.vendor === "google");
        expect(google).toHaveLength(2);
        expect(
            google.reduce((sum, r) => sum + r.values["2026-08:forecast"], 0),
        ).toBe(-730);
        expect(result.remainingCurrentPlanUsd).toBe(95);
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
                balance("google", 0),
            ],
            undefined,
            [stripeSales()],
        );
        expect(result.remainingCurrentPlanUsd).toBe(-605);
        expect(result.projectedMonthEndCashUsd).toBe(19295);
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
                { ...balance("google", 0), start: "2026-09-01 00:00:00" },
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
        ).toContain("Usage coverage date missing");
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

    it("refuses a balance-aware projection without a checked balance", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({ vendor: "vast.ai", type: "gpu" }),
        ]);

        expect(result.flags).toContain(
            "Checked balance missing for vast.ai; prepaid or postpaid run-rate cash is not forecast.",
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
        expect(compute?.values["2026-08:current"]).toBe(0);
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
        expect(retell?.forecastIssue).toContain("vendor ledger");
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
        expect(tinybird?.values["2026-05:actual"]).toBe(0);
        expect(
            result.flags.some(
                (flag) =>
                    /tinybird/.test(flag) &&
                    /2026-05/.test(flag) &&
                    /ledger/.test(flag),
            ),
        ).toBe(true);
        // June is paid and the ledger covers July: a postpaid bill, no warning.
        expect(
            result.flags.some(
                (flag) => /tinybird/.test(flag) && /2026-06/.test(flag),
            ),
        ).toBe(false);
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

    it.each([
        "assemblyai",
        "openai",
    ])("budgets continued %s API usage after prepaid credit runs out", (vendor) => {
        const result = buildRunway([opening()], NOW, [
            cloud({ vendor, paid: 0, credit: -220 }),
            {
                ...balance(vendor, 0, 100),
                end: "2027-12-31",
            },
        ]);
        const row = result.rows.find(
            (row) => row.vendor === vendor && row.category === "compute",
        );
        // 220 through August 22 => 310/month. Remaining August usage
        // consumes 90 credits; September's 310 uses the final 10 first.
        expect(row?.forecastMethod).toBe("last");
        expect(row?.forecastPaymentTiming).toBe("prepaid");
        expect(row?.forecastIssue).toBeUndefined();
        expect(row?.values["2026-08:forecast"]).toBe(0);
        expect(row?.values["2026-09:forecast"]).toBeCloseTo(-300);
        expect(row?.values["2026-10:forecast"]).toBeCloseTo(-310);
    });

    it("budgets OVH compute and infrastructure against one shared credit balance", () => {
        const result = buildRunway([opening()], NOW, [
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
            { ...balance("ovhcloud", 0, 150), end: "2027-12-31" },
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
        // 465/month together. August consumes 135 remaining credits;
        // September consumes the last 15, leaving 450 payable in October.
        expect(cash("2026-09")).toBe(0);
        expect(cash("2026-10")).toBeCloseTo(-450);
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
