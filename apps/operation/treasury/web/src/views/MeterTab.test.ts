import { describe, expect, it } from "vitest";
import type { MeterMonthlyRow, OverrideRow, TransactionRow } from "../types";

function meterRow(
    month: string,
    provider: string,
    amount: number,
    source = "manual",
): MeterMonthlyRow {
    return {
        month,
        provider,
        amount,
        currency: "USD",
        funding: "credit",
        source,
    };
}

function transactionRow(provider: string, category: string): TransactionRow {
    return {
        date: "2026-06-01",
        provider,
        category,
        bank_charged_amount: 0,
        bank_charged_currency: "",
        cash_paid_amount: 0,
        cash_paid_currency: "",
        credit_burned_amount: 0,
        credit_burned_currency: "",
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

describe("meter reset overrides", () => {
    it("removes manual rows for reset buckets", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: [
                    meterRow("2026-06", "digitalocean", 288),
                    meterRow("2026-06", "openai", 42, "api"),
                ],
                overrides: [
                    overrideRow("digitalocean|2026-06|credit|USD", "1"),
                ],
            }),
        ).toEqual([meterRow("2026-06", "openai", 42, "api")]);
    });

    it("keeps manual rows when the latest override says not to reset", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        const rows = [meterRow("2026-06", "digitalocean", 288)];
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: rows,
                overrides: [
                    overrideRow("digitalocean|2026-06|credit|USD", "0"),
                ],
            }),
        ).toEqual(rows);
    });
});

describe("visibleMeterRows", () => {
    it("returns datasource-shaped meter rows", async () => {
        const { visibleMeterRows } = await import("./MeterTab");
        expect(
            visibleMeterRows({
                meterRows: [meterRow("2026-06", "digitalocean", 288)],
                month: "2026-06",
                provider: "digitalocean",
            }),
        ).toEqual([meterRow("2026-06", "digitalocean", 288)]);
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
            }),
        ).toEqual([meterRow("2026-06", "digitalocean", 288)]);
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
            }),
        ).toEqual([]);
    });
});
