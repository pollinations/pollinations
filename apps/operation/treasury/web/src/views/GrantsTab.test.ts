import { describe, expect, it } from "vitest";
import type { GrantRow } from "../types";
import { visibleGrantRows } from "./GrantsTab";

const grant = (vendor: string, label: string): GrantRow => ({
    vendor,
    label,
    granted: 1000,
    currency: "USD",
    start_date: "2026-01-01",
    expires: "1970-01-01",
});

describe("visibleGrantRows", () => {
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
