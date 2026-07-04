import { describe, expect, it } from "vitest";
import {
    buildManualBalanceChange,
    buildManualMeterChange,
    validateManualAmount,
} from "./UsageEntryForm";

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
                note: "entered in treasury app",
            },
            summary: "meter assemblyai 2026-03 credit -> 242.5",
        });
    });

    it("builds a manual balance snapshot row", () => {
        expect(
            buildManualBalanceChange({
                amount: 1200,
                provider: "lambda",
                runAt: "2026-07-03 12:00:00",
            }),
        ).toEqual({
            datasource: "balances",
            key: "balances:lambda",
            row: {
                run_at: "2026-07-03 12:00:00",
                provider: "lambda",
                granted_usd: null,
                spent_usd: null,
                left_usd: 1200,
                prepaid_left_usd: null,
                source: "manual",
                note: "entered in treasury app",
            },
            summary: "balance lambda left_usd -> 1200",
        });
    });

    it("validates non-negative numeric amounts", () => {
        expect(validateManualAmount("0")).toBe(0);
        expect(validateManualAmount("10.25")).toBe(10.25);
        expect(validateManualAmount("-1")).toBeNull();
        expect(validateManualAmount("nope")).toBeNull();
    });
});
