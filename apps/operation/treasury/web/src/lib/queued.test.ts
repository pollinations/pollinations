import { describe, expect, it } from "vitest";
import { queuedKeysForChange, queuedMeterKey } from "./queued";
import type { StagedChange } from "./staging";

const change = (
    datasource: string,
    row: Record<string, unknown>,
): StagedChange => ({
    id: "x",
    key: `${datasource}:x`,
    datasource,
    row,
    summary: "x",
});

describe("queuedKeysForChange", () => {
    it("maps meter rows", () => {
        expect(
            queuedKeysForChange(
                change("meter_monthly", {
                    month: "2026-03",
                    provider: "assemblyai",
                }),
            ),
        ).toEqual([queuedMeterKey("2026-03", "assemblyai")]);
    });

    it("ignores overrides because they apply after the next forager run", () => {
        expect(
            queuedKeysForChange(
                change("overrides", {
                    scope: "transactions",
                    key: "2026-01-01|€1.00||||missing_invoice",
                }),
            ),
        ).toEqual([]);
    });
});
