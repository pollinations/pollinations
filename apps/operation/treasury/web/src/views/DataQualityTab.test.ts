import { describe, expect, it } from "vitest";
import type { VendorPlanes } from "../lib/insights";
import {
    dataQualityStatItems,
    dataQualitySummary,
    planeRank,
    problemsFirst,
    visiblePlaneRows,
} from "./DataQualityTab";

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

describe("dataQualitySummary", () => {
    it("counts warnings, missing witnesses, reconciled rows, drift, and totals", () => {
        const rows = [
            plane("2026-07", "aws", {
                status: "ok",
                cloudUsd: 10,
                pollenCostUsd: 8,
                calibX: 1.25,
            }),
            plane("2026-07", "azure", {
                status: "missing cloud",
                cloudUsd: null,
                pollenCostUsd: 4,
            }),
            plane("2026-07", "google", {
                status: "missing cash",
                cloudUsd: 6,
                pollenCostUsd: 5,
                calibX: 1.2,
            }),
            plane("2026-07", "aws", {
                status: "drift",
                cloudUsd: 20,
                pollenCostUsd: 10,
                calibX: 2,
            }),
            plane("2026-07", "lambda", {
                status: "timing",
                cloudUsd: 2,
                pollenCostUsd: null,
            }),
        ];

        expect(dataQualitySummary(rows)).toEqual({
            total: 5,
            warnings: 4,
            missingWitnesses: 2,
            reconciled: 1,
            drift: 1,
            calibrated: 3,
            timing: 1,
            cloudUsd: 38,
            pollenUsd: 27,
        });
    });
});

describe("planeRank", () => {
    it("puts meter gaps before cash gaps, drift, timing, and ok rows", () => {
        expect(
            planeRank(plane("2026-07", "aws", { status: "missing cloud" })),
        ).toBe(0);
        expect(
            planeRank(plane("2026-07", "aws", { status: "missing pollen" })),
        ).toBe(0);
        expect(
            planeRank(plane("2026-07", "aws", { status: "missing cash" })),
        ).toBe(1);
        expect(planeRank(plane("2026-07", "aws", { status: "drift" }))).toBe(2);
        expect(planeRank(plane("2026-07", "aws", { status: "timing" }))).toBe(
            3,
        );
        expect(planeRank(plane("2026-07", "aws", { status: "ok" }))).toBe(4);
    });
});

describe("problemsFirst", () => {
    it("orders meter gaps, cash gaps, drift, timing, and healthy rows by month desc", () => {
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

describe("dataQualityStatItems", () => {
    const summary = dataQualitySummary([plane("2026-06", "aws")]);

    it("shows a healthy FX card when no month needs the fallback rate", () => {
        const fx = dataQualityStatItems(summary, []).find(
            (item) => item.label === "FX",
        );
        expect(fx?.value).toBe("rates ok");
        expect(fx?.tone).toBe("pos");
    });

    it("warns with the affected months when EUR rows use the fallback", () => {
        const fx = dataQualityStatItems(summary, ["2031-01"]).find(
            (item) => item.label === "FX",
        );
        expect(fx?.value).toBe("1 fallback");
        expect(fx?.tone).toBe("warn");
        expect(fx?.detail).toContain("January 31");
    });
});
