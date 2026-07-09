import { describe, expect, it } from "vitest";
import type { VendorPlanes } from "../lib/insights";
import {
    planeRank,
    problemsFirst,
    visiblePlaneRows,
} from "./ReconciliationTab";

const plane = (
    month: string,
    vendor: string,
    overrides: Partial<VendorPlanes> = {},
): VendorPlanes => ({
    month,
    vendor,
    cashUsd: null,
    cloudPaidUsd: null,
    cloudCreditUsd: null,
    cloudUsd: null,
    meterCloudUsd: null,
    pollenPaidCostUsd: 1,
    pollenQuestCostUsd: null,
    pollenCostUsd: 1,
    calibX: null,
    cashCoverage: null,
    meterCoverage: null,
    status: "ok",
    ...overrides,
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

describe("planeRank", () => {
    it("puts missing witnesses before drift, timing, and ok rows", () => {
        expect(
            planeRank(plane("2026-07", "aws", { status: "missing cash" })),
        ).toBe(0);
        expect(planeRank(plane("2026-07", "aws", { status: "drift" }))).toBe(1);
        expect(planeRank(plane("2026-07", "aws", { status: "timing" }))).toBe(
            2,
        );
        expect(planeRank(plane("2026-07", "aws", { status: "ok" }))).toBe(3);
    });
});

describe("problemsFirst", () => {
    it("orders missing witnesses, then drift, timing, and healthy rows by month desc", () => {
        const healthyNew = plane("2026-07", "aws");
        const healthyOld = plane("2026-06", "aws");
        const timing = plane("2026-07", "vast.ai", { status: "timing" });
        const drifted = plane("2026-05", "google", { status: "drift" });
        const missingCash = plane("2026-04", "vast.ai", {
            status: "missing cash",
        });
        const missingCloud = plane("2026-06", "openrouter", {
            status: "missing cloud",
        });

        expect(
            problemsFirst([
                healthyOld,
                healthyNew,
                timing,
                drifted,
                missingCash,
                missingCloud,
            ]),
        ).toEqual([
            missingCloud,
            missingCash,
            drifted,
            timing,
            healthyNew,
            healthyOld,
        ]);
    });

    it("orders same-rank rows by newest month then vendor", () => {
        const aws = plane("2026-07", "aws", { status: "missing pollen" });
        const google = plane("2026-07", "google", {
            status: "missing cloud",
        });
        const older = plane("2026-06", "azure", { status: "missing cash" });

        expect(problemsFirst([older, google, aws])).toEqual([
            aws,
            google,
            older,
        ]);
    });
});
