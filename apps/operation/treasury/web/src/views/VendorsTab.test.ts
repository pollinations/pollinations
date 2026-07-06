import { describe, expect, it } from "vitest";
import type { VendorPlanes } from "../lib/insights";
import { visiblePlaneRows } from "./VendorsTab";

const plane = (month: string, vendor: string): VendorPlanes => ({
    month,
    vendor,
    paidUsd: null,
    spentUsd: null,
    creditUsd: null,
    registeredUsd: 1,
    spentVsRegisteredPct: null,
});

describe("visiblePlaneRows", () => {
    const rows = [
        plane("2026-06", "aws"),
        plane("2026-07", "aws"),
        plane("2026-07", "google"),
    ];

    it("filters by month and vendor", () => {
        expect(
            visiblePlaneRows({ rows, month: "2026-07", vendor: "aws" }),
        ).toEqual([plane("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(visiblePlaneRows({ rows, month: "", vendor: "all" })).toEqual(
            rows,
        );
    });
});
