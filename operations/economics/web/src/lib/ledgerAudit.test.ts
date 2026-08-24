import { describe, expect, it } from "vitest";
import type {
    Data,
    OpCloudRow,
    OpForecastRow,
    OpPollenRow,
    OpTransactionRow,
} from "../types";
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

const forecast = (over: Partial<OpForecastRow> = {}): OpForecastRow => ({
    entry_id: "forecast-1",
    month: "2026-08-01",
    vendor: "aws",
    category: "compute",
    amount: -100,
    currency: "USD",
    method: "fixed",
    source: "reviewed",
    evidence: "forecast batch",
    recorded_at: "2026-08-01 00:00:00",
    ...over,
});

const data = (over: Partial<Data> = {}): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    opForecast: [],
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
            forecastRows: 0,
            transactionEvidenceGaps: 0,
            missingMappings: 0,
            estimatedFx: false,
            invalidRows: 0,
            duplicateRows: 0,
        });
    });

    it("audits forecast-only months and invalid forecast facts", () => {
        const rows = monthlyLedgerAuditRows(
            data({
                opForecast: [
                    forecast(),
                    forecast({
                        entry_id: "forecast-2",
                        currency: "GBP",
                    }),
                ],
            }),
            "",
            "2026-08",
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            month: "2026-08",
            forecastRows: 2,
            invalidRows: 1,
            invalidProviders: ["aws"],
            status: "structural",
        });
    });

    it("surfaces duplicates, invalid facts, evidence gaps, and unmapped providers", () => {
        const [row] = monthlyLedgerAuditRows(
            data({
                opTransactions: [
                    transaction({ evidence: "" }),
                    transaction({ entry_id: "wise-2", evidence: "" }),
                ],
                opCloud: [
                    cloud({ type: "unknown" }),
                    cloud({ entry_id: "cloud-2", type: "unknown" }),
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
        expect(row.transactionEvidenceGaps).toBe(1);
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
            forecastRows: 0,
            invalidRows: 3,
        });
    });
});
