import { describe, expect, it } from "vitest";
import type { ProviderMonthlyRow } from "../types";
import { visibleProviderRows } from "./ProviderTab";

const row = (month: string, vendor: string): ProviderMonthlyRow => ({
    month,
    vendor,
    currency: "USD",
    credit: 1,
    paid: 0,
    source: "api",
});

describe("visibleProviderRows", () => {
    const rows = [
        row("2026-06", "aws"),
        row("2026-07", "aws"),
        row("2026-07", "gcp"),
    ];

    it("filters by month and vendor", () => {
        expect(
            visibleProviderRows({
                providerRows: rows,
                month: "2026-07",
                vendor: "aws",
            }),
        ).toEqual([row("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(
            visibleProviderRows({
                providerRows: rows,
                month: "",
                vendor: "all",
            }),
        ).toEqual(rows);
    });
});
