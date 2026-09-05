import { describe, expect, it } from "vitest";
import type {
    OpCloudRow,
    OpTransactionRow,
    PrivateForecastRule,
    StripeSalesRow,
} from "../types";
import { buildRunway } from "./runway";

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
        expect(
            result.rows.find(
                (row) => row.vendor === "processor settlement timing",
            )?.values[july.id],
        ).toBe(-15);
        expect(
            result.rows.reduce((sum, row) => sum + row.values[july.id], 0),
        ).toBe(july.netUsd);
        expect(july.netUsd).toBe(80);
        expect(result.currentCashUsd).toBe(1080);
        expect(
            result.assumptions.find((row) => row.vendor === "pollen sales")
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
                row.vendor === "pollen sales" && row.category === "revenue",
        );
        const stripeRefundsRow = result.rows.find(
            (row) =>
                row.vendor === "stripe refunds" && row.category === "revenue",
        );
        const stripeFees = result.rows.find(
            (row) =>
                row.vendor === "stripe fees" && row.category === "operations",
        );
        const july = result.columns.find(
            (column) => column.id === "2026-07:actual",
        );

        expect(stripeSalesRow?.values["2026-07:actual"]).toBe(120);
        expect(stripeSalesRow?.values["2026-09:forecast"]).toBe(120);
        expect(stripeRefundsRow?.values["2026-07:actual"]).toBe(-20);
        expect(stripeRefundsRow?.values["2026-09:forecast"]).toBe(-20);
        expect(stripeFees?.values["2026-07:actual"]).toBe(-5);
        expect(stripeFees?.values["2026-09:forecast"]).toBe(-5);
        expect(july?.netUsd).toBe(80);
        expect(result.currentCashUsd).toBe(1_080);
    });

    it("separates Pollen and Ko-fi sales, refunds and exceptional reversals without changing cash", () => {
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
        expect(value("pollen sales")).toBe(120);
        expect(value("ko-fi")).toBe(20);
        expect(value("stripe refunds")).toBe(-20);
        expect(value("stripe reversals")).toBe(-10);
        expect(value("stripe fees")).toBe(-7);
        expect(value("processor settlement timing")).toBe(-23);
        expect(value("pollen sales", "2026-09:forecast")).toBe(120);
        expect(value("ko-fi", "2026-09:forecast")).toBe(20);
        expect(value("stripe reversals", "2026-09:forecast")).toBe(0);
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
            result.rows.find((row) => row.vendor === "pollen sales")?.values[
                "2026-06:actual"
            ],
        ).toBe(120);
        expect(
            result.assumptions.some((row) => row.vendor === "pollen sales"),
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
            result.rows.find((row) => row.vendor === "pollen sales")?.values[
                "2026-08:actual"
            ],
        ).toBe(1000);
        expect(
            result.rows.find((row) => row.vendor === "pollen sales")?.values[
                "2026-09:actual"
            ],
        ).toBe(120);
        expect(
            result.assumptions.some((row) => row.vendor === "pollen sales"),
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

    it("flags opening postpaid bills instead of presenting zero as a verified plan", () => {
        const result = buildRunway([opening()], NOW, [
            cloud({
                start: "2026-07-01 00:00:00",
                end: "2026-08-01 00:00:00",
                paid: -700,
            }),
            balance("google", 0),
        ]);
        expect(
            result.rows.find((r) => r.vendor === "google")?.forecastIssue,
        ).toContain("Opening 2026-07 postpaid settlement not reconciled");
        expect(
            result.columns.find((c) => c.id === "2026-08:forecast")
                ?.forecastComplete,
        ).toBe(false);
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
