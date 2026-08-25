import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import {
    gpuResourceRows,
    gpuResourceSummary,
    gpuWorkloadRows,
    gpuWorkloadSummary,
    visibleGpuResourceRows,
} from "./GpuTab";

const baseData: Data = {
    opTransactions: [],
    opCloud: [],
    opPollen: [],
};

function cloud(overrides: Partial<OpCloudRow>): OpCloudRow {
    return {
        entry_id: "cloud-test",
        source: "api",
        vendor: "runpod",
        type: "gpu",
        start: "2026-06-01 00:00:00",
        end: "",
        credit: 0,
        paid: -100,
        currency: "USD",
        resource_id: "pod-1",
        resource_name: "pod-1",
        resource_sku: "RTX 4090",
        resource_count: 1,
        model: "zimage",
        evidence: "",
        recorded_at: "2026-07-01 00:00:00",
        ...overrides,
    };
}

function pollen(overrides: Partial<OpPollenRow>): OpPollenRow {
    return {
        source: "tb",
        month: "2026-06",
        vendor: "runpod",
        model: "zimage",
        currency: "USD",
        cost_paid: 0,
        cost_quests: 0,
        price_paid: 160,
        price_quests: 40,
        byop_paid: 10,
        byop_quests: 0,
        model_paid: 20,
        model_quests: 0,
        requests_paid: 80,
        requests_quests: 20,
        ...overrides,
    };
}

describe("gpuResourceRows", () => {
    it("keeps one row per GPU and attaches its storage and network usage", () => {
        const rows = gpuResourceRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "vast.ai",
                        entry_id: "gpu",
                        resource_id: "42",
                        resource_name: "Vast.ai instance 42 · gpu",
                        resource_sku: "gpu-hours",
                        resource_count: 10,
                        model: "",
                        paid: -100,
                    }),
                    cloud({
                        vendor: "vast.ai",
                        entry_id: "storage",
                        resource_id: "42",
                        resource_name: "Vast.ai instance 42 · storage",
                        resource_sku: "storage-hours",
                        resource_count: 11,
                        model: "",
                        paid: -10,
                    }),
                    cloud({
                        vendor: "vast.ai",
                        entry_id: "network",
                        resource_id: "42",
                        resource_name: "Vast.ai instance 42 · download",
                        resource_sku: "download-gb",
                        resource_count: 5,
                        model: "",
                        paid: -2,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            kind: "gpu",
            vendor: "vast.ai",
            resourceId: "42",
            resourceName: "#42",
            gpuHours: 10,
            storageHours: 11,
            networkGb: 5,
            paidCostUsd: 112,
            totalCostUsd: 112,
            costPerGpuHour: 11.2,
        });
    });

    it("keeps storage-only resources out of the GPU count", () => {
        const rows = gpuResourceRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "vast.ai",
                        entry_id: "gpu",
                        resource_id: "42",
                        resource_sku: "gpu-hours",
                        resource_count: 10,
                        model: "",
                        paid: -100,
                    }),
                    cloud({
                        vendor: "vast.ai",
                        entry_id: "orphan-storage",
                        resource_id: "old-1",
                        resource_sku: "storage-hours",
                        resource_count: 2,
                        model: "",
                        paid: -3,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.kind === "overhead")).toMatchObject({
            vendor: "vast.ai",
            resourceName: "Overhead & adjustments",
            storageHours: 2,
            paidCostUsd: 3,
            relatedResources: 1,
        });
        expect(gpuResourceSummary(rows)).toEqual({
            gpuCount: 1,
            overheadCostUsd: 3,
            overheadResources: 1,
            totalCostUsd: 103,
        });
    });

    it("uses resource rows for legacy Lambda and RunPod hourly extracts", () => {
        const rows = gpuResourceRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "runpod",
                        resource_id: "pod-1",
                        resource_count: 24,
                    }),
                    cloud({
                        vendor: "runpod",
                        resource_id: "pod-2",
                        resource_count: 12,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.gpuHours)).toEqual([24, 12]);
        expect(
            visibleGpuResourceRows(rows, "runpod").map((row) => row.resourceId),
        ).toEqual(["pod-1", "pod-2"]);
    });

    it("keeps refunds as one overhead adjustment instead of a fake GPU", () => {
        const rows = gpuResourceRows(
            {
                ...baseData,
                opCloud: [
                    cloud({ paid: -100 }),
                    cloud({
                        entry_id: "refund",
                        resource_id: "refund-1",
                        resource_name: "billing-history refund",
                        resource_sku: "",
                        resource_count: 1,
                        paid: 5,
                    }),
                ],
            },
            "2026-06",
        );

        expect(gpuResourceSummary(rows)).toMatchObject({
            gpuCount: 1,
            overheadCostUsd: -5,
            totalCostUsd: 95,
        });
    });

    it("classifies legacy usage independently of adjustment row order", () => {
        const usage = cloud({
            vendor: "runpod",
            entry_id: "usage",
            resource_id: "pod-1",
            resource_count: 24,
            paid: -100,
        });
        const adjustment = cloud({
            vendor: "runpod",
            entry_id: "refund",
            resource_id: "pod-1",
            resource_name: "billing-history refund",
            resource_count: 1,
            paid: 5,
        });

        for (const opCloud of [
            [usage, adjustment],
            [adjustment, usage],
        ]) {
            const rows = gpuResourceRows({ ...baseData, opCloud }, "2026-06");
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                kind: "gpu",
                gpuHours: 24,
                paidCostUsd: 95,
            });
        }
    });
});

describe("gpuWorkloadRows", () => {
    it("groups GPUs across vendors and calculates efficiency per workload", () => {
        const rows = gpuWorkloadRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "runpod",
                        resource_id: "runpod-zimage",
                        model: "zimage",
                        paid: -30,
                        credit: -10,
                    }),
                    cloud({
                        vendor: "vast.ai",
                        resource_id: "vast-zimage",
                        resource_sku: "gpu-hours",
                        resource_count: 24,
                        model: "zimage",
                        paid: -60,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "runpod",
                        model: "zimage",
                        price_paid: 80,
                        price_quests: 20,
                        byop_paid: 10,
                        model_paid: 0,
                    }),
                    pollen({
                        vendor: "vast.ai",
                        model: "zimage",
                        price_paid: 120,
                        price_quests: 30,
                        byop_paid: 20,
                        model_paid: 10,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            kind: "workload",
            workload: "zimage",
            vendors: "runpod, vast.ai",
            gpuCount: 2,
            paidUsd: 200,
            questUsd: 50,
            retainedUsd: 160,
            paidCostUsd: 90,
            creditCostUsd: 10,
            totalCostUsd: 100,
            currentResultUsd: 70,
            currentPerformancePct: 43.75,
            fullCostResultUsd: 60,
            fullCostPerformancePct: 37.5,
            flags: [],
        });
        expect(rows[0].resources).toHaveLength(2);
    });

    it("keeps shared-model GPU pools as one workload", () => {
        const rows = gpuWorkloadRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "lambda",
                        resource_id: "shared-gpu",
                        model: "sana,ltx-2",
                    }),
                ],
                opPollen: [
                    pollen({ vendor: "lambda", model: "sana" }),
                    pollen({
                        vendor: "lambda",
                        model: "ltx-2",
                        price_paid: 20,
                        price_quests: 10,
                        byop_paid: 5,
                        model_paid: 5,
                        requests_paid: 10,
                        requests_quests: 5,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            workload: "ltx-2 + sana",
            vendors: "lambda",
            gpuCount: 1,
            paidUsd: 180,
            questUsd: 50,
            retainedUsd: 140,
            totalCostUsd: 100,
            currentResultUsd: 40,
            currentPerformancePct: (40 / 140) * 100,
            fullCostResultUsd: 40,
            fullCostPerformancePct: (40 / 140) * 100,
        });
    });

    it("keeps unknown short-lived GPUs visible without inventing efficiency", () => {
        const rows = gpuWorkloadRows(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        vendor: "vast.ai",
                        resource_id: "failed-start",
                        resource_sku: "gpu-hours",
                        resource_count: 0.5,
                        model: "",
                        paid: -0.08,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            kind: "unassigned",
            workload: "Unassigned",
            gpuCount: 1,
            totalCostUsd: 0.08,
            retainedUsd: null,
            currentResultUsd: null,
            currentPerformancePct: null,
            fullCostResultUsd: null,
            fullCostPerformancePct: null,
            flags: ["unmapped"],
        });
    });

    it("keeps cash and full-cost workload results separate", () => {
        const rows = gpuWorkloadRows(
            {
                ...baseData,
                opCloud: [cloud({ paid: -50, credit: -100 })],
                opPollen: [pollen({})],
            },
            "2026-06",
        );

        expect(rows[0]).toMatchObject({
            retainedUsd: 130,
            paidCostUsd: 50,
            creditCostUsd: 100,
            currentResultUsd: 80,
            fullCostResultUsd: -20,
            flags: [],
        });
        expect(
            (rows[0].currentResultUsd ?? 0) - (rows[0].fullCostResultUsd ?? 0),
        ).toBe(rows[0].creditCostUsd);
    });
});

describe("gpuWorkloadSummary", () => {
    it("uses the same workload rows as the GPU table", () => {
        const rows = gpuWorkloadRows(
            {
                ...baseData,
                opCloud: [cloud({ paid: -50, credit: -100 })],
                opPollen: [pollen({})],
            },
            "2026-06",
        );

        expect(gpuWorkloadSummary(rows)).toMatchObject({
            paidUsd: 160,
            questUsd: 40,
            retainedUsd: 130,
            paidCostUsd: 50,
            creditCostUsd: 100,
            currentResultUsd: 80,
            fullCostResultUsd: -20,
        });
    });
});
