import { describe, expect, it } from "vitest";
import type { MeterMonthlyRow } from "../types";
import { visibleMeterRows } from "./MeterTab";

const row = (month: string, provider: string): MeterMonthlyRow => ({
    month,
    provider,
    currency: "USD",
    credit: 1,
    paid: 0,
    source: "api",
});

describe("visibleMeterRows", () => {
    const rows = [
        row("2026-06", "aws"),
        row("2026-07", "aws"),
        row("2026-07", "gcp"),
    ];

    it("filters by month and provider", () => {
        expect(
            visibleMeterRows({
                meterRows: rows,
                month: "2026-07",
                provider: "aws",
            }),
        ).toEqual([row("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(
            visibleMeterRows({ meterRows: rows, month: "", provider: "all" }),
        ).toEqual(rows);
    });
});
