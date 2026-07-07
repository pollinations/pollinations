import { describe, expect, it } from "vitest";
import type { GrantRow, ProviderMonthlyRow } from "../types";
import { visibleGrantRows, visibleProviderRows } from "./ProviderTab";

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

describe("visibleGrantRows", () => {
    const grant = (vendor: string, label: string): GrantRow => ({
        vendor,
        label,
        granted: 1000,
        currency: "USD",
        start_date: "2026-01-01",
        expires: "1970-01-01",
    });
    const rows = [
        grant("azure", "lot 1"),
        grant("azure", "lot 2"),
        grant("lambda", ""),
    ];

    it("filters by vendor only", () => {
        expect(visibleGrantRows({ grantRows: rows, vendor: "azure" })).toEqual([
            grant("azure", "lot 1"),
            grant("azure", "lot 2"),
        ]);
    });

    it("returns everything for the all filter", () => {
        expect(visibleGrantRows({ grantRows: rows, vendor: "all" })).toEqual(
            rows,
        );
    });
});
