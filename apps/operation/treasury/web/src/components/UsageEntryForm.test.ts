import { describe, expect, it } from "vitest";
import { buildManualMeterChange, validateManualAmount } from "./UsageEntryForm";

describe("UsageEntryForm row builders", () => {
    it("builds a manual monthly meter row", () => {
        expect(
            buildManualMeterChange({
                amount: 242.5,
                funding: "credit",
                month: "2026-03",
                provider: "assemblyai",
            }),
        ).toEqual({
            datasource: "meter_monthly",
            key: "meter:assemblyai:2026-03:credit",
            row: {
                month: "2026-03",
                provider: "assemblyai",
                cost_usd: 242.5,
                funding: "credit",
                source: "manual",
            },
            summary: "usage assemblyai 2026-03 credit -> 242.5",
        });
    });

    it("validates non-negative numeric amounts", () => {
        expect(validateManualAmount("0")).toBe(0);
        expect(validateManualAmount("10.25")).toBe(10.25);
        expect(validateManualAmount("-1")).toBeNull();
        expect(validateManualAmount("nope")).toBeNull();
    });
});
