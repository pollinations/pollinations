import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import { monthlyLedgerAuditRows } from "./ledgerAudit";

const transaction = (
    over: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-1",
    source: "wise",
    date: "2026-07-10",
    vendor: "aws",
    category: "cloud",
    amount: -10,
    currency: "USD",
    description: "AWS",
    evidence:
        "https://drive.google.com/file/d/wise-statement/view?usp=drivesdk",
    recorded_at: "2026-08-01 00:00:00",
    ...over,
});

const cloud = (over: Partial<OpCloudRow> = {}): OpCloudRow => ({
    entry_id: "cloud-1",
    source: "api",
    vendor: "aws",
    type: "inference",
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: -10,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "",
    evidence:
        "https://drive.google.com/file/d/provider-statement/view?usp=drivesdk",
    recorded_at: "2026-08-01 00:00:00",
    ...over,
});

const pollen = (over: Partial<OpPollenRow> = {}): OpPollenRow => ({
    month: "2026-07",
    vendor: "aws",
    model: "claude",
    currency: "USD",
    cost_paid: 10,
    cost_quests: 0,
    price_paid: 10,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
    ...over,
});

const data = (over: Partial<Data> = {}): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    opRunway: [],
    ...over,
});

describe("monthlyLedgerAuditRows", () => {
    it("reports a structurally clean, reconciled closed month", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [transaction()],
                opCloud: [cloud()],
                opPollen: [pollen()],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row).toMatchObject({
            status: "clean",
            transactionRows: 1,
            cloudRows: 1,
            pollenRows: 1,
            transactionEvidenceGaps: 0,
            missingMappings: 0,
            estimatedFx: false,
            invalidRows: 0,
            duplicateRows: 0,
        });
    });

    it("surfaces duplicates, invalid facts, evidence gaps, and unmapped providers", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({ evidence: "" }),
                    transaction({ evidence: "" }),
                ],
                opCloud: [
                    cloud({ type: "unknown" }),
                    cloud({ type: "unknown" }),
                ],
                opPollen: [
                    pollen({
                        vendor: "new-provider",
                        cost_paid: -1,
                    }),
                    pollen({
                        vendor: "new-provider",
                        cost_paid: -1,
                    }),
                ],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row).toMatchObject({
            status: "structural",
            transactionEvidenceGaps: 2,
            transactionEvidenceProviders: ["aws"],
            missingMappings: 1,
            missingMappingProviders: ["new-provider"],
            invalidRows: 4,
            invalidProviders: ["aws", "new-provider"],
            duplicateRows: 2,
            duplicateProviders: ["aws"],
        });
    });

    it("leaves provider statement readiness to Close", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opCloud: [
                    cloud({
                        entry_id: "cloud-model-a",
                        model: "model-a",
                        evidence: "local export row",
                    }),
                    cloud({
                        entry_id: "cloud-model-b",
                        model: "model-b",
                        evidence: "local export row",
                    }),
                ],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row.status).toBe("clean");
    });

    it("marks the current month as partial without replacing its clean status", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [transaction()],
                opCloud: [cloud()],
                opPollen: [pollen()],
            }),
            "2026-07",
            "2026-07",
        );

        expect(row.status).toBe("clean");
        expect(row.partial).toBe(true);
    });

    it("still surfaces structural errors in the current month", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opCloud: [cloud({ source: "mystery", type: "unknown" })],
            }),
            "2026-07",
            "2026-07",
        );

        expect(row.status).toBe("structural");
        expect(row.partial).toBe(true);
        expect(row.invalidRows).toBe(1);
    });

    it("surfaces future rows that use the latest published FX rate", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({
                        date: "2031-01-10",
                        currency: "EUR",
                        vendor: "stripe",
                        category: "revenue",
                    }),
                ],
            }),
            "2031-01",
            "2031-02",
        );

        expect(row).toMatchObject({
            status: "attention",
            estimatedFx: true,
        });
    });
});
