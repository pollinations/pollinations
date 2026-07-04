import { describe, expect, it } from "vitest";
import {
    queuedInvoiceKey,
    queuedKeysForChange,
    queuedMeterKey,
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

    it("maps invoices", () => {
        expect(
            queuedKeysForChange(change("invoices", { sha256: "abc123" })),
        ).toEqual([queuedInvoiceKey("abc123")]);
    });
});
