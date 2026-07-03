import { describe, expect, it } from "vitest";
import { buildAcceptChange, canResolveGapStatus } from "./GapActions";

describe("GapActions", () => {
    it("knows which reconciliation statuses can be resolved", () => {
        expect(canResolveGapStatus("missing_invoice")).toBe(true);
        expect(canResolveGapStatus("amount_mismatch")).toBe(true);
        expect(canResolveGapStatus("needs_review")).toBe(true);
        expect(canResolveGapStatus("needs_data")).toBe(true);
        expect(canResolveGapStatus("ok")).toBe(false);
    });

    it("builds a reconciliation accept override", () => {
        expect(
            buildAcceptChange({
                enteredAt: "2026-07-03 12:00:00",
                month: "2026-03",
                note: "dashboard says no invoice",
                provider: "assemblyai",
            }),
        ).toEqual({
            datasource: "overrides",
            row: {
                entered_at: "2026-07-03 12:00:00",
                scope: "reconciliation",
                key: "2026-03:assemblyai",
                field: "accepted",
                value_num: null,
                value_str: "1",
                note: "dashboard says no invoice",
            },
            summary: "recon assemblyai 2026-03 accepted",
        });
    });
});
