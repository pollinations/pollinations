import { describe, expect, it } from "vitest";
import {
    buildManualMeterChange,
    buildMeterManualResetChange,
    validateManualAmount,
} from "./UsageEntryForm";

describe("UsageEntryForm row builders", () => {
    it("builds a manual monthly meter row", () => {
        expect(
            buildManualMeterChange({
                amount: 242.5,
                currency: "USD",
                funding: "credit",
                month: "2026-03",
                provider: "assemblyai",
            }),
        ).toEqual({
            datasource: "meter_monthly",
            key: "meter:assemblyai:2026-03:credit:USD",
            row: {
                month: "2026-03",
                provider: "assemblyai",
                amount: 242.5,
                currency: "USD",
                funding: "credit",
                source: "manual",
            },
            summary: "usage assemblyai 2026-03 credit -> 242.5 USD",
        });
    });

    it("validates non-negative numeric amounts", () => {
        expect(validateManualAmount("0")).toBe(0);
        expect(validateManualAmount("10.25")).toBe(10.25);
        expect(validateManualAmount("-1")).toBeNull();
        expect(validateManualAmount("nope")).toBeNull();
    });

    it("builds a manual meter reset override", () => {
        expect(
            buildMeterManualResetChange({
                currency: "USD",
                enteredAt: "2026-07-04 12:34:56",
                funding: "credit",
                month: "2026-06",
                provider: "aws",
                reset: true,
            }),
        ).toEqual({
            datasource: "overrides",
            key: "meter-reset:aws|2026-06|credit|USD",
            row: {
                entered_at: "2026-07-04 12:34:56",
                scope: "meter_monthly",
                key: "aws|2026-06|credit|USD",
                field: "reset_manual",
                value_num: null,
                value_str: "1",
                note: "",
            },
            summary: "usage aws 2026-06 credit USD reset manual value",
            hidden: false,
        });
    });

    it("builds hidden reset-clear overrides for manual edits", () => {
        expect(
            buildMeterManualResetChange({
                currency: "EUR",
                enteredAt: "2026-07-04 12:34:56",
                funding: "prepaid",
                month: "2026-06",
                provider: "aws",
                reset: false,
            }),
        ).toMatchObject({
            datasource: "overrides",
            key: "meter-reset:aws|2026-06|prepaid|EUR",
            row: {
                value_str: "0",
            },
            hidden: true,
        });
    });
});
