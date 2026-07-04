import { describe, expect, it } from "vitest";
import {
    queuedInvoiceKey,
    queuedKeysForChange,
    queuedMeterKey,
    queuedReconKey,
} from "./queued";
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
    it("maps reconciliation accepts", () => {
        expect(
            queuedKeysForChange(
                change("overrides", {
                    scope: "reconciliation",
                    key: "2026-03:assemblyai",
                }),
            ),
        ).toEqual([queuedReconKey("2026-03", "assemblyai")]);
    });

    it("maps meter rows to burn and recon keys", () => {
        expect(
            queuedKeysForChange(
                change("meter_monthly", {
                    month: "2026-03",
                    provider: "assemblyai",
                }),
            ),
        ).toEqual([
            queuedMeterKey("2026-03", "assemblyai"),
            queuedReconKey("2026-03", "assemblyai"),
        ]);
    });

    it("maps invoices", () => {
        expect(
            queuedKeysForChange(change("invoices", { sha256: "abc123" })),
        ).toEqual([queuedInvoiceKey("abc123")]);
    });
});
