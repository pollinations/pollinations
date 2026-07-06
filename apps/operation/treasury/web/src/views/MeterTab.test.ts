import { describe, expect, it } from "vitest";
import type {
    MeterMonthlyRow,
    OverrideRow,
    TransactionRow,
    UsageMonthlyRow,
} from "../types";
import { aggregateMeterRows } from "./MeterTab";

function usageRow(
    month: string,
    provider: string,
    model = "gpt",
): UsageMonthlyRow {
    return {
        source: "tinybird",
        month,
        provider,
        model,
        cost_paid_pollen: 1,
        cost_quest_pollen: 0,
        billable_paid_pollen: 1,
        billable_quest_pollen: 0,
    };
}

function meterRow(
    month: string,
    provider: string,
    cost_usd: number,
): MeterMonthlyRow {
    return {
        month,
        provider,
        cost_usd,
        funding: "credit",
        source: "manual",
    };
}

function transactionRow(provider: string, category: string): TransactionRow {
    return {
        date: "2026-06-01",
        provider,
        category,
        bank_charged: "",
        cash_paid: "",
        credit_burned: "",
        invoice_ref: "",
        match_status: "matched",
    };
}

function overrideRow(
    key: string,
    value_str: "0" | "1",
    field = "reset_manual",
): OverrideRow {
    return {
        scope: "meter_monthly",
        key,
        field,
        value_num: null,
        value_str,
    };
}

describe("aggregateMeterRows", () => {
    it("uses manual rows as replacements for the same provider month bucket", () => {
        expect(
            aggregateMeterRows([
                {
                    month: "2026-06",
                    provider: "aws",
                    cost_usd: 1990,
                    funding: "prepaid",
                    source: "api",
                },
                {
                    month: "2026-06",
                    provider: "aws",
                    cost_usd: 2010,
                    funding: "prepaid",
                    source: "manual",
                },
            ]),
        ).toEqual([
            {
                month: "2026-06",
                provider: "aws",
                creditUsage: 0,
                prepaidUsage: 2010,
                creditSources: [],
                prepaidSources: ["manual"],
                sources: ["manual"],
            },
        ]);
    });
});

describe("meter reset overrides", () => {
    it("removes manual rows for reset buckets", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: [
                    meterRow("2026-06", "digitalocean", 288),
                    {
                        month: "2026-06",
                        provider: "openai",
                        cost_usd: 42,
                        funding: "credit",
                        source: "api",
                    },
                ],
                overrides: [overrideRow("digitalocean|2026-06|credit", "1")],
            }),
        ).toEqual([
            {
                month: "2026-06",
                provider: "openai",
                cost_usd: 42,
                funding: "credit",
                source: "api",
            },
        ]);
    });

    it("keeps manual rows when the latest override says not to reset", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        const rows = [meterRow("2026-06", "digitalocean", 288)];
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: rows,
                overrides: [overrideRow("digitalocean|2026-06|credit", "0")],
            }),
        ).toEqual(rows);
    });
});

describe("MeterTab backfill", () => {
    it("synthesizes zero rows for providers with Pollen usage", async () => {
        const { withProviderBackfillRows } = await import("./MeterTab");
        expect(
            withProviderBackfillRows({
                provider: "all",
                rows: [],
                usageRows: [usageRow("2026-06", "openai")],
            }),
        ).toEqual([
            {
                month: "2026-06",
                provider: "openai",
                creditUsage: 0,
                prepaidUsage: 0,
                creditSources: [],
                prepaidSources: [],
                sources: ["usage"],
            },
        ]);
    });

    it("does not synthesize rows for providers without Pollen usage", async () => {
        const { withProviderBackfillRows } = await import("./MeterTab");
        expect(
            withProviderBackfillRows({
                provider: "anthropic",
                rows: [],
                usageRows: [usageRow("2026-06", "openai")],
            }),
        ).toEqual([]);
    });

    it("synthesizes one row per used provider month in a selected period", async () => {
        const { withProviderBackfillRows } = await import("./MeterTab");
        expect(
            withProviderBackfillRows({
                provider: "all",
                rows: [],
                usageRows: [
                    usageRow("2026-05", "openai"),
                    usageRow("2026-06", "openai"),
                ],
            }),
        ).toEqual([
            {
                month: "2026-05",
                provider: "openai",
                creditUsage: 0,
                prepaidUsage: 0,
                creditSources: [],
                prepaidSources: [],
                sources: ["usage"],
            },
            {
                month: "2026-06",
                provider: "openai",
                creditUsage: 0,
                prepaidUsage: 0,
                creditSources: [],
                prepaidSources: [],
                sources: ["usage"],
            },
        ]);
    });

    it("keeps provider meter rows even without matching Pollen usage", async () => {
        const { visibleMeterRows } = await import("./MeterTab");
        expect(
            visibleMeterRows({
                meterRows: [meterRow("2026-06", "digitalocean", 288)],
                month: "2026-06",
                provider: "digitalocean",
                usageRows: [usageRow("2026-06", "openai")],
            }),
        ).toEqual([
            {
                month: "2026-06",
                provider: "digitalocean",
                creditUsage: 288,
                prepaidUsage: 0,
                creditSources: ["manual"],
                prepaidSources: [],
                sources: ["manual"],
            },
        ]);
    });

    it("treats uncategorized provider meter rows as compute", async () => {
        const { visibleMeterRows } = await import("./MeterTab");
        expect(
            visibleMeterRows({
                category: "compute",
                meterRows: [meterRow("2026-06", "digitalocean", 288)],
                month: "2026-06",
                provider: "all",
                transactions: [],
                usageRows: [],
            }),
        ).toEqual([
            {
                month: "2026-06",
                provider: "digitalocean",
                creditUsage: 288,
                prepaidUsage: 0,
                creditSources: ["manual"],
                prepaidSources: [],
                sources: ["manual"],
            },
        ]);
    });

    it("uses transaction categories when a provider has one", async () => {
        const { visibleMeterRows } = await import("./MeterTab");
        expect(
            visibleMeterRows({
                category: "compute",
                meterRows: [meterRow("2026-06", "tinybird", 34.74)],
                month: "2026-06",
                provider: "all",
                transactions: [transactionRow("tinybird", "infra")],
                usageRows: [],
            }),
        ).toEqual([]);
    });
});
