import { describe, expect, it } from "vitest";
import type { MeterMonthlyRow } from "../types";
import { visibleMeterRows } from "./MeterTab";

const row = (month: string, vendor: string): MeterMonthlyRow => ({
    month,
    vendor,
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

    it("filters by month and vendor", () => {
        expect(
            visibleMeterRows({
                meterRows: rows,
                month: "2026-07",
                vendor: "aws",
            }),
        ).toEqual([row("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(
            visibleMeterRows({ meterRows: rows, month: "", vendor: "all" }),
        ).toEqual(rows);
    });
});
