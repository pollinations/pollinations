import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import { monthlyLedgerAuditRows } from "./ledgerAudit";

const transaction = (
    over: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-1",
    kind: "transaction",
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
            missingBankData: false,
            actionableTransactionEvidenceGaps: 0,
            acknowledgedTransactionEvidenceGaps: 0,
            missingMappings: 0,
            estimatedFx: false,
            invalidRows: 0,
            duplicateRows: 0,
        });
    });

    it("treats unsupported bank currencies as structural errors", () => {
        const [row] = monthlyLedgerAuditRows(
            data({ opTransactions: [transaction({ currency: "GBP" })] }),
            "2026-07",
            "2026-08",
        );

        expect(row).toMatchObject({
            status: "structural",
            invalidRows: 1,
            invalidProviders: ["aws"],
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
            actionableTransactionEvidenceGaps: 2,
            actionableTransactionEvidenceProviderCounts: [
                { provider: "aws", count: 2 },
            ],
            acknowledgedTransactionEvidenceGaps: 0,
            acknowledgedTransactionEvidenceProviderCounts: [],
            missingMappings: 1,
            missingMappingProviders: ["new-provider"],
            invalidRows: 4,
            invalidProviders: ["aws", "new-provider"],
            duplicateRows: 2,
            duplicateProviders: ["aws"],
        });
    });

    it("does not call distinct source transactions duplicates when their values match", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({ entry_id: "wise-1" }),
                    transaction({ entry_id: "wise-2" }),
                ],
                opCloud: [
                    cloud({ entry_id: "cloud-1" }),
                    cloud({ entry_id: "cloud-2" }),
                ],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row.duplicateRows).toBe(0);
        expect(row.duplicateProviders).toEqual([]);
    });

    it("leaves provider statement readiness to Close", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [transaction()],
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

    it("flags a closed month with no bank transactions", () => {
        const [row] = monthlyLedgerAuditRows(
            data({ opCloud: [cloud()] }),
            "2026-07",
            "2026-08",
        );

        expect(row).toMatchObject({
            status: "attention",
            transactionRows: 0,
            missingBankData: true,
        });
    });

    it("does not treat an unresolved exception note as resolved evidence", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({
                        description: "Distinct supplier invoice unresolved",
                    }),
                ],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row.status).toBe("attention");
        expect(row.actionableTransactionEvidenceGaps).toBe(1);
        expect(row.acknowledgedTransactionEvidenceGaps).toBe(0);
    });

    it("keeps acknowledged lost documents visible without blocking a clean month", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({
                        entry_id: "wise-openai-lost",
                        vendor: "openai",
                        evidence: "",
                        description:
                            "OpenAI subscription · supplier invoice lost and unavailable",
                    }),
                    transaction({
                        entry_id: "wise-space-lost",
                        vendor: "space-berlin",
                        evidence: "",
                        description:
                            "Space Berlin · receipt lost and unavailable",
                    }),
                ],
            }),
            "2026-07",
            "2026-08",
        );

        expect(row).toMatchObject({
            status: "clean",
            actionableTransactionEvidenceGaps: 0,
            actionableTransactionEvidenceProviderCounts: [],
            acknowledgedTransactionEvidenceGaps: 2,
            acknowledgedTransactionEvidenceProviderCounts: [
                { provider: "openai", count: 1 },
                { provider: "space-berlin", count: 1 },
            ],
        });
    });

    it("keeps an acknowledged permanent provider loss visible but non-blocking", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({
                        date: "2026-02-26",
                        vendor: "pruna",
                        evidence: "",
                        description:
                            "Provider cannot supply the historical receipt",
                    }),
                ],
            }),
            "2026-02",
            "2026-08",
        );

        expect(row.status).toBe("clean");
        expect(row.actionableTransactionEvidenceGaps).toBe(0);
        expect(row.acknowledgedTransactionEvidenceGaps).toBe(1);
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

    it("surfaces malformed dates even when they cannot form a month", () => {
        const rows = monthlyLedgerAuditRows(
            data({
                opTransactions: [transaction({ date: "2026-02-31" })],
                opCloud: [cloud({ start: "missing" })],
                opPollen: [pollen({ month: "2026-99" })],
            }),
            "",
            "2026-08",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            month: "Invalid date",
            status: "structural",
            transactionRows: 1,
            cloudRows: 1,
            pollenRows: 1,
            missingBankData: false,
            invalidRows: 3,
        });
    });
});
