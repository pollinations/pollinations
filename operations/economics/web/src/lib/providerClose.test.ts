import { describe, expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import {
    attentionFirst,
    providerClosePeriodStatus,
    providerCloseRows,
    providerCloseSummary,
} from "./providerClose";

const cloud = (over: Partial<OpCloudRow> = {}): OpCloudRow => ({
    entry_id: "cloud-test",
    source: "provider-statement",
    vendor: "azure",
    type: "inference",
    start: "2026-06-01 00:00:00",
    end: "2026-07-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "",
    evidence: "https://drive.google.com/file/d/provider-statement/view",
    recorded_at: "2026-07-10 00:00:00",
    ...over,
});

const pollen = (over: Partial<OpPollenRow> = {}): OpPollenRow => ({
    source: "tinybird",
    month: "2026-06",
    vendor: "azure",
    model: "gpt-credit-model",
    currency: "USD",
    cost_paid: 80,
    cost_quests: 20,
    price_paid: 120,
    price_quests: 0,
    byop_paid: 10,
    byop_quests: 0,
    model_paid: 10,
    model_quests: 0,
    requests_paid: 100,
    requests_quests: 20,
    ...over,
});

const transaction = (
    over: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-buffer-july",
    kind: "transaction",
    source: "wise",
    date: "2026-07-10",
    vendor: "buffer",
    category: "operations",
    amount: -10,
    currency: "USD",
    description: "Buffer subscription",
    evidence: "",
    recorded_at: "2026-08-01 00:00:00",
    ...over,
});

const data = (over: Partial<Data>): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    privateConfig: PRIVATE_CONFIG_FIXTURE,
    ...over,
});

describe("providerCloseRows", () => {
    it("includes expected active accounts even when no usage was imported", () => {
        const rows = providerCloseRows(
            data({ opCloud: [cloud({ vendor: "aws" })] }),
            "2026-07",
        );
        const azure = rows.find((row) => row.vendor === "azure");
        expect(azure).toMatchObject({
            coverageStatus: "missing",
            closeStatus: "needs account check",
        });
    });

    it("requires calendar coverage for infrastructure and does not accept a mid-month billing cycle", () => {
        const rows = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "cloudflare",
                        account_id: "myceli",
                        type: "infra",
                        start: "2026-08-01 00:00:00",
                        end: "2026-08-22 00:00:00",
                        credit: -100,
                    }),
                ],
            }),
            "2026-09",
        );
        expect(rows.find((row) => row.vendor === "cloudflare")).toMatchObject({
            closeStatus: "needs provider check",
            coverageStatus: "partial",
            creditFreeUsd: 100,
            billedUsd: 0,
        });
    });

    it("does not bridge missing days between two usage exports", () => {
        const rows = providerCloseRows(
            data({
                opCloud: [
                    cloud({ vendor: "aws", end: "2026-06-10 00:00:00" }),
                    cloud({ vendor: "aws", start: "2026-06-20 00:00:00" }),
                ],
            }),
            "2026-07",
        );
        expect(rows.find((row) => row.vendor === "aws")).toMatchObject({
            coverageStatus: "partial",
            closeStatus: "needs provider check",
        });
    });

    it("shows an actionable bank-document gap in the monthly detail", () => {
        const rows = providerCloseRows(
            data({ opTransactions: [transaction()] }),
            "2026-08",
        );
        const [row] = rows;

        expect(row).toMatchObject({
            month: "2026-07",
            vendor: "buffer",
            closeStatus: "missing document",
            fundingStatus: "not applicable",
            transactionDocumentStatus: "missing",
        });
        expect(providerCloseSummary([row]).blockers).toBe(1);
    });

    it("does not turn an acknowledged lost document into a close blocker", () => {
        const rows = providerCloseRows(
            data({
                opTransactions: [
                    transaction({
                        vendor: "openai",
                        description:
                            "OpenAI subscription · supplier invoice lost and unavailable",
                    }),
                ],
                opCloud: [
                    cloud({
                        vendor: "openai",
                        account_id: "",
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                    }),
                ],
            }),
            "2026-08",
        );

        expect(rows.find((row) => row.vendor === "openai")).toMatchObject({
            vendor: "openai",
            closeStatus: "ready",
            transactionDocumentStatus: "acknowledged",
        });
    });

    it("sorts unresolved transaction evidence above ready rows", () => {
        const missing = providerCloseRows(
            data({ opTransactions: [transaction()] }),
            "2026-08",
        )[0];
        const ready = providerCloseRows(
            data({
                opTransactions: [
                    transaction({
                        vendor: "discord",
                        description:
                            "Discord receipt · supplier invoice lost and unavailable",
                    }),
                ],
            }),
            "2026-08",
        )[0];

        expect(
            attentionFirst([ready, missing]).map((row) => row.vendor),
        ).toEqual(["buffer", "discord"]);
    });

    it("keeps a fully credit-funded provider at zero cash cost", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud({ credit: -100 })],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("credit/free");
        expect(row.billedUsd).toBe(0);
        expect(row.creditFreeUsd).toBe(100);
    });

    it("records cash-funded usage from the provider source", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud({ vendor: "aws", paid: -100 })],
                opPollen: [pollen({ vendor: "aws" })],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("billed");
        expect(row.billedUsd).toBe(100);
    });

    it("counts one archived document once when several rows cite it", () => {
        const sharedDocument =
            "https://drive.google.com/file/d/provider-statement/view";
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        entry_id: "cloud-model-a",
                        model: "model-a",
                        evidence: `model-a usage · ${sharedDocument}`,
                    }),
                    cloud({
                        entry_id: "cloud-model-b",
                        model: "model-b",
                        evidence: `model-b usage · ${sharedDocument}`,
                    }),
                ],
            }),
        );

        expect(row.evidence).toHaveLength(1);
        expect(row.evidence[0].source).toBe("provider-statement");
    });

    it("keeps raw ledger references out of the Close document list", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({ evidence: '{"usage": 42, "source": "cli"}' }),
                ],
            }),
        );

        expect(row.evidence).toEqual([]);
    });

    it("does not infer a payable cost from usage without a statement", () => {
        const [row] = providerCloseRows(data({ opPollen: [pollen()] }));

        expect(row.closeStatus).toBe("needs account check");
        expect(row.fundingStatus).toBe("needs check");
        expect(row.billedUsd).toBeNull();
    });

    it("does not treat a local source note as an archived statement", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        paid: -100,
                        evidence: "source data/inbox/provider-close.json",
                    }),
                ],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("needs provider check");
        expect(row.fundingStatus).toBe("needs check");
        expect(row.billedUsd).toBeNull();
    });

    it("does not treat a grant award as a checked zero-cost statement", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        source: "grant",
                        credit: 10_000,
                        evidence: "startup grant award",
                    }),
                ],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("needs provider check");
        expect(row.fundingStatus).toBe("needs check");
        expect(row.billedUsd).toBeNull();
        expect(row.creditFreeUsd).toBeNull();
    });

    it("keeps payment reconciliation outside provider close", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud({ paid: -60, credit: -40 })],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("mixed");
        expect(row.billedUsd).toBe(60);
        expect(row.creditFreeUsd).toBe(40);
    });

    it("treats an explicit zero statement as checked and free", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud()],
                opPollen: [
                    pollen({
                        cost_paid: 0,
                        cost_quests: 0,
                        price_paid: 75,
                        byop_paid: 0,
                        model_paid: 0,
                    }),
                ],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("credit/free");
        expect(row.billedUsd).toBe(0);
    });

    it("summarizes only operational close amounts", () => {
        const rows = providerCloseRows(
            data({
                opCloud: [cloud({ credit: -100 })],
                opPollen: [pollen(), pollen({ vendor: "openai" })],
            }),
        );
        const summary = providerCloseSummary(
            rows.filter((row) => ["azure", "openai"].includes(row.vendor)),
        );

        expect(summary.closedRows).toBe(2);
        expect(summary.partialRows).toBe(0);
        expect(summary.closeReady).toBe(1);
        expect(summary.blockers).toBe(1);
        expect(summary.billedUsd).toBe(0);
        expect(summary.creditFreeUsd).toBe(100);
    });

    it("treats a checked zero-activity statement as ready without usage", () => {
        const [row] = providerCloseRows(
            data({ opCloud: [cloud()] }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("credit/free");
    });

    it("closes a provider-only residual when every active account is covered", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: ["myceli-ai", "myceli-ai2", "elliot-4"].map(
                    (accountId, index) =>
                        cloud({
                            entry_id: `modal-${index}`,
                            account_id: accountId,
                            vendor: "modal",
                            start: "2026-07-01 00:00:00",
                            end: "2026-08-01 00:00:00",
                            credit: -0.38201479,
                        }),
                ),
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
    });

    it("resolves a known project alias to its active billing account", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        account_id: "stellar-verve-465920-b7",
                        vendor: "google",
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                        paid: -100,
                    }),
                ],
                opPollen: [
                    pollen({
                        month: "2026-07",
                        vendor: "google",
                    }),
                ],
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
    });

    it("flags incomplete active-account coverage", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        account_id: "myceli-ai",
                        vendor: "modal",
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                        credit: -0.38201479,
                    }),
                ],
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("needs account check");
    });

    it("does not require an external statement for internal usage", () => {
        const [row] = providerCloseRows(
            data({
                opPollen: [
                    pollen({
                        month: "2026-03",
                        vendor: "bpai",
                    }),
                ],
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("not applicable");
    });

    it("keeps an unmapped vendor visible for correction", () => {
        const [row] = providerCloseRows(
            data({
                opPollen: [pollen({ vendor: "new-provider" })],
            }),
            "2026-08",
        );

        expect(row.vendor).toBe("new-provider");
        expect(row.closeStatus).toBe("needs provider check");
    });

    it("accepts a documented historical provider gap", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "pruna",
                        start: "2026-03-01 00:00:00",
                        end: "2026-04-01 00:00:00",
                        evidence: "source data/inbox/pruna-history.json",
                    }),
                ],
                opPollen: [
                    pollen({
                        month: "2026-03",
                        vendor: "pruna",
                    }),
                ],
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("unknown");
    });

    it("does not use Pollen meter drift as a close status", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "assemblyai",
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                        credit: -250,
                    }),
                ],
                opPollen: [
                    pollen({
                        month: "2026-07",
                        vendor: "assemblyai",
                    }),
                ],
            }),
            "2026-08",
        );

        expect(row.closeStatus).toBe("ready");
    });

    it("excludes the current month from close readiness", () => {
        const rows = providerCloseRows(data({ opCloud: [cloud()] }), "2026-06");
        const summary = providerCloseSummary(rows);

        expect(rows[0].partial).toBe(true);
        expect(summary.closedRows).toBe(0);
        expect(summary.partialRows).toBe(rows.length);
        expect(summary.closeReady).toBe(0);
        expect(summary.blockers).toBe(0);
    });

    it("excludes provider months before the accounting window", () => {
        const rows = providerCloseRows(
            data({
                opCloud: [
                    cloud({
                        start: "2025-12-01 00:00:00",
                        end: "2026-01-01 00:00:00",
                    }),
                ],
                opPollen: [pollen({ month: "2025-12" })],
            }),
            "2026-08",
        );

        expect(rows).toEqual([]);
    });
});

describe("providerClosePeriodStatus", () => {
    it("keeps the current month open", () => {
        expect(
            providerClosePeriodStatus({
                closedRows: 0,
                partialRows: 2,
                closeReady: 0,
                blockers: 0,
                billedUsd: 0,
                creditFreeUsd: 0,
            }),
        ).toBe("open");
    });

    it("requires action when any closed provider-month is blocked", () => {
        expect(
            providerClosePeriodStatus({
                closedRows: 4,
                partialRows: 0,
                closeReady: 3,
                blockers: 1,
                billedUsd: 100,
                creditFreeUsd: 0,
            }),
        ).toBe("action needed");
    });

    it("marks a fully checked period ready but never filed", () => {
        expect(
            providerClosePeriodStatus({
                closedRows: 4,
                partialRows: 0,
                closeReady: 4,
                blockers: 0,
                billedUsd: 100,
                creditFreeUsd: 0,
            }),
        ).toBe("ready");
    });
});
