import { describe, expect, it } from "vitest";
import {
    queuedBalanceKey,
    queuedGrantKey,
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

    it("maps balances, grants, and invoices", () => {
        expect(
            queuedKeysForChange(change("balances", { provider: "lambda" })),
        ).toEqual([queuedBalanceKey("lambda")]);
        expect(
            queuedKeysForChange(
                change("overrides", { scope: "grants", key: "lambda-credit" }),
            ),
        ).toEqual([queuedGrantKey("lambda-credit")]);
        expect(
            queuedKeysForChange(change("invoices", { sha256: "abc123" })),
        ).toEqual([queuedInvoiceKey("abc123")]);
    });
});
