import { describe, expect, it } from "vitest";
import type { VendorPlanes } from "../lib/insights";
import {
    coverageLabel,
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
    transactionsUsd: null,
    providerUsd: null,
    creditUsd: null,
    pollenUsd: 1,
    calibX: null,
    coverage: null,
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

describe("problemsFirst", () => {
    it("orders funding gaps, then calib drift, then healthy by month desc", () => {
        const healthyNew = plane("2026-07", "aws", { coverage: "ok cash" });
        const healthyOld = plane("2026-06", "aws", { coverage: "ok cash" });
        const drifted = plane("2026-05", "google", {
            calibX: 1.5,
            coverage: "ok credit",
        });
        const uncovered = plane("2026-04", "vast", { coverage: "uncovered" });
        const unverified = plane("2026-06", "xai", {
            coverage: "paid unverified",
        });

        expect(
            problemsFirst([
                healthyOld,
                healthyNew,
                drifted,
                uncovered,
                unverified,
            ]),
        ).toEqual([unverified, uncovered, drifted, healthyNew, healthyOld]);
    });

    it("does not treat in-tolerance calib as a problem", () => {
        const inTolerance = plane("2026-05", "aws", {
            calibX: 1.1,
            coverage: "ok cash",
        });
        const drifted = plane("2026-07", "google", {
            calibX: 0.5,
            coverage: "ok cash",
        });

        expect(problemsFirst([inTolerance, drifted])).toEqual([
            drifted,
            inTolerance,
        ]);
    });
});

describe("coverageLabel", () => {
    it("returns null for missing coverage", () => {
        expect(coverageLabel(null)).toBeNull();
    });

    it("maps uncovered to the Unfunded warning bucket", () => {
        expect(coverageLabel("uncovered")).toBe("⚠ Unfunded");
    });

    it("maps paid unverified to the Unverified warning bucket", () => {
        expect(coverageLabel("paid unverified")).toBe("⚠ Unverified");
    });

    it("collapses every other raw reason to Funded", () => {
        for (const reason of [
            "ok cash",
            "ok credit",
            "cash ±1mo",
            "prepaid",
            "internal",
        ] as const) {
            expect(coverageLabel(reason)).toBe("Funded");
        }
    });
});
