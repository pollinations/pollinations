import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import {
    computeModeIndex,
    directDeliveryData,
    managedInferenceData,
    providerMonthComputeMode,
} from "./computeModes";

const cloud = (
    vendor: string,
    type: string,
    month = "2026-07",
): OpCloudRow => ({
    entry_id: `${month}-${vendor}-${type}`,
    source: "dashboard",
    vendor,
    type,
    start: `${month}-01`,
    end: `${month}-31`,
    credit: -5,
    paid: 0,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 0,
    model: "",
    evidence: "evidence",
    recorded_at: `${month}-31 00:00:00`,
});

const pollen = (vendor: string, month = "2026-07"): OpPollenRow => ({
    month,
    vendor,
    model: "model",
    currency: "USD",
    cost_paid: 1,
    cost_quests: 0,
    price_paid: 1,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
});

describe("compute modes", () => {
    it("classifies provider-months from their observed cost mechanism", () => {
        const data: Data = {
            opCloud: [
                cloud("openai", "inference"),
                cloud("vast.ai", "gpu"),
                cloud("modal", "inference"),
                cloud("modal", "gpu"),
            ],
        };
        const index = computeModeIndex(data);

        expect(providerMonthComputeMode(index, "2026-07", "openai")).toBe(
            "managed-inference",
        );
        expect(providerMonthComputeMode(index, "2026-07", "vast.ai")).toBe(
            "gpu-capacity",
        );
        expect(providerMonthComputeMode(index, "2026-07", "modal")).toBe(
            "mixed",
        );
    });

    it("keeps mixed Pollen unallocated while retaining inference costs", () => {
        const data: Data = {
            opCloud: [
                cloud("openai", "inference"),
                cloud("modal", "inference"),
                cloud("modal", "gpu"),
            ],
            opPollen: [pollen("openai"), pollen("modal")],
        };
        const result = managedInferenceData(data);

        expect(result.opCloud?.map((row) => row.vendor)).toEqual([
            "openai",
            "modal",
        ]);
        expect(result.opPollen?.map((row) => row.vendor)).toEqual(["openai"]);
    });

    it("keeps a month unclassified when it has no cloud row", () => {
        const data: Data = {
            opPollen: [pollen("openai"), pollen("vast.ai")],
        };
        const index = computeModeIndex(data);

        expect(providerMonthComputeMode(index, "2026-07", "openai")).toBe(
            "unclassified",
        );
        expect(providerMonthComputeMode(index, "2026-07", "vast.ai")).toBe(
            "unclassified",
        );
    });

    it("keeps community economics out of managed inference", () => {
        const result = managedInferenceData({
            opCloud: [
                cloud("openai", "inference"),
                cloud("community", "inference"),
            ],
            opPollen: [pollen("openai"), pollen("community")],
        });

        expect(result.opCloud?.map((row) => row.vendor)).toEqual(["openai"]);
        expect(result.opPollen?.map((row) => row.vendor)).toEqual(["openai"]);
    });

    it("keeps inference and GPU costs together for vendor economics while excluding infrastructure", () => {
        const result = directDeliveryData({
            opCloud: [
                cloud("modal", "inference"),
                cloud("modal", "gpu"),
                cloud("modal", "infra"),
                cloud("community", "gpu"),
            ],
            opPollen: [pollen("modal"), pollen("community")],
        });

        expect(result.opCloud?.map((row) => row.type)).toEqual([
            "inference",
            "gpu",
        ]);
        expect(result.opPollen?.map((row) => row.vendor)).toEqual(["modal"]);
    });
});
