import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import { gpuEconomics, gpuSummary, visibleGpuRows } from "./GpuTab";

const baseData: Data = {
    opTransactions: [],
    opCloud: [],
    opPollen: [],
};

function cloud(overrides: Partial<OpCloudRow>): OpCloudRow {
    return {
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

describe("gpuEconomics", () => {
    it("builds GPU rows from OP Cloud burn and OP Pollen", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [
                    cloud({ paid: -90, credit: -10 }),
                    cloud({
                        resource_id: "grant",
                        paid: 0,
                        credit: 5000,
                        resource_name: "grant received",
                    }),
                ],
                opPollen: [pollen({})],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            vendor: "runpod",
            models: "zimage",
            rentUsd: 100,
            paidRentUsd: 90,
            creditRentUsd: 10,
            requests: 100,
            paidUsd: 160,
            questUsd: 40,
            retainedUsd: 130,
            marginUsd: 30,
            marginPct: (30 / 130) * 100,
            effUsdPerReq: 1,
            flags: [],
        });
        expect(rows[0].breakEven).toEqual([
            { model: "zimage", unit: "img", volume: 50_000 },
        ]);
    });

    it("sums rent across pods and models for the same vendor+month, without splitting Pollen", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        resource_sku: "RTX 4090",
                        model: "zimage",
                        paid: -75,
                    }),
                    cloud({
                        resource_id: "pod-2",
                        resource_sku: "RTX A5000",
                        model: "klein",
                        paid: -25,
                    }),
                ],
                opPollen: [
                    pollen({
                        price_paid: 100,
                        requests_paid: 100,
                        requests_quests: 0,
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            vendor: "runpod",
            models: "klein, zimage",
            rentUsd: 100,
            paidUsd: 100,
            requests: 100,
        });
    });

    it("keeps separate vendors as separate rows", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [
                    cloud({ vendor: "runpod" }),
                    cloud({ vendor: "lambda", resource_id: "pod-2" }),
                ],
                opPollen: [
                    pollen({ vendor: "runpod" }),
                    pollen({ vendor: "lambda" }),
                ],
            },
            "2026-06",
        );

        expect(rows).toHaveLength(2);
    });

    it("flags missing model", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [
                    cloud({
                        resource_sku: "",
                        model: "",
                    }),
                ],
            },
            "2026-06",
        );

        expect(rows[0].models).toBe("");
        expect(rows[0].flags).toEqual(["missing model"]);
    });

    it("flags no Pollen match when a model exists but nothing matched", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [cloud({})],
            },
            "2026-06",
        );

        expect(rows[0].flags).toEqual(["no Pollen match"]);
    });
});

describe("visibleGpuRows", () => {
    it("filters by vendor", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [
                    cloud({ vendor: "runpod" }),
                    cloud({ vendor: "lambda" }),
                ],
            },
            "2026-06",
        );

        expect(visibleGpuRows(rows, "lambda").map((row) => row.vendor)).toEqual(
            ["lambda"],
        );
        expect(visibleGpuRows(rows, "all")).toHaveLength(2);
    });
});

describe("gpuSummary", () => {
    it("rolls up GPU rows for stat cards", () => {
        const rows = gpuEconomics(
            {
                ...baseData,
                opCloud: [cloud({})],
                opPollen: [pollen({})],
            },
            "2026-06",
        );

        expect(gpuSummary(rows)).toMatchObject({
            paidUsd: 160,
            questUsd: 40,
            rentUsd: 100,
            creditRentUsd: 0,
            retainedUsd: 130,
            marginUsd: 30,
            marginPct: (30 / 130) * 100,
            flaggedRows: 0,
        });
    });
});
