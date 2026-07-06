import { describe, expect, it } from "vitest";
import { buildMeterManualResetChange } from "../components/UsageEntryForm";
import type { StageInput } from "../lib/staging";
import type { MeterMonthlyRow, OverrideRow } from "../types";
import type { MeterStageChange } from "./MeterTab";

function meterRow(
    month: string,
    provider: string,
    creditAmount: number,
    source = "manual",
): MeterMonthlyRow {
    return {
        month,
        provider,
        currency: "USD",
        credit: creditAmount,
        paid: 0,
        source,
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

function stagedChange(input: StageInput): MeterStageChange {
    return {
        datasource: input.datasource,
        key: input.key ?? "test-change",
        row: input.row,
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
                overrides: [overrideRow("digitalocean|2026-06|USD", "1")],
            }),
        ).toEqual([meterRow("2026-06", "openai", 42, "api")]);
    });

    it("removes combined manual source rows for reset buckets", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: [
                    meterRow("2026-06", "digitalocean", 288, "manual,cli"),
                    meterRow("2026-06", "openai", 42, "api"),
                ],
                overrides: [overrideRow("digitalocean|2026-06|USD", "1")],
            }),
        ).toEqual([meterRow("2026-06", "openai", 42, "api")]);
    });

    it("keeps manual rows when the latest override says not to reset", async () => {
        const { effectiveMeterRowsWithOverrides } = await import("./MeterTab");
        const rows = [meterRow("2026-06", "digitalocean", 288)];
        expect(
            effectiveMeterRowsWithOverrides({
                meterRows: rows,
                overrides: [overrideRow("digitalocean|2026-06|USD", "0")],
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

    it("ignores transaction categories", async () => {
        const { visibleMeterRows } = await import("./MeterTab");
        expect(
            visibleMeterRows({
                meterRows: [meterRow("2026-06", "digitalocean", 288)],
                month: "2026-06",
                provider: "all",
            }),
        ).toEqual([meterRow("2026-06", "digitalocean", 288)]);
    });

    it("keeps browser-only pending reset rows visible until saved", async () => {
        const { visibleMeterRowsForSession } = await import("./MeterTab");
        const rows = [meterRow("2026-07", "replicate", 200)];
        const resetChange = stagedChange(
            buildMeterManualResetChange({
                currency: "USD",
                month: "2026-07",
                provider: "replicate",
                reset: true,
            }),
        );

        expect(
            visibleMeterRowsForSession({
                meterRows: rows,
                month: "2026-07",
                provider: "replicate",
            }),
        ).toEqual(rows);

        expect(
            visibleMeterRowsForSession({
                committedChanges: [resetChange],
                meterRows: rows,
                month: "2026-07",
                provider: "replicate",
            }),
        ).toEqual([]);
    });
});
