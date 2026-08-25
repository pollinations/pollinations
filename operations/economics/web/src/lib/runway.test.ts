import { describe, expect, it } from "vitest";
import type { OpCloudRow, OpTransactionRow } from "../types";
import { buildRunway } from "./runway";

const NOW = new Date("2026-08-25T12:00:00.000Z");

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

describe("buildRunway", () => {
    it("reconstructs cash from the statement opening balance and movements", () => {
        const result = buildRunway(
            [opening(1_000), transaction({ amount: -100 })],
            NOW,
        );

        expect(result.currentCashUsd).toBe(900);
        expect(result.openingBalanceUsd).toBe(1_000);
    });

    it("derives fixed subscriptions from reviewed rules, not forecast rows", () => {
        const result = buildRunway([opening()], NOW);
        const openai = result.rows.find(
            (row) => row.vendor === "openai" && row.category === "development",
        );

        expect(openai?.values["2026-08:forecast"]).toBe(-600);
        expect(openai?.values["2027-01:forecast"]).toBe(-600);
        expect(openai?.values["2027-12:forecast"]).toBe(-600);
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
        );
        const elevenlabs = result.rows.find(
            (row) => row.vendor === "elevenlabs" && row.category === "compute",
        );

        expect(elevenlabs?.values["2026-08:forecast"]).toBe(-299);
        expect(elevenlabs?.values["2026-09:forecast"]).toBe(-299);
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
            -100 * 1.1411 - 50,
            6,
        );
        expect(github?.assumptions["2026-09:forecast"]).toHaveLength(2);
    });

    it("keeps only reviewed scheduled events and lifecycle boundaries", () => {
        const result = buildRunway([opening()], NOW);
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

        expect(refund?.values["2026-08:forecast"]).toBeCloseTo(
            12_036.42 * 1.1411,
            2,
        );
        expect(refund?.values["2026-12:forecast"]).toBeCloseTo(
            13_204.82 * 1.1411,
            2,
        );
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
        ).toEqual([-50, -80]);
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
        );
        const notion = result.rows.find((row) => row.vendor === "notion");

        expect(notion?.values["2026-09:forecast"]).toBe(0);
        expect(notion?.forecastMethod).toBe("one_off");
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
