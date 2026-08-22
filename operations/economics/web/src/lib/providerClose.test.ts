import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import { providerCloseRows, providerCloseSummary } from "./providerClose";

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
    entry_id: "wise-provider-payment",
    source: "wise",
    date: "2026-07-10",
    vendor: "aws",
    category: "cloud",
    amount: -100,
    currency: "USD",
    description: "AWS invoice",
    evidence: "https://drive.google.com/file/d/wise-payment/view",
    recorded_at: "2026-07-10 00:00:00",
    ...over,
});

const data = (over: Partial<Data>): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    opRunway: [],
    ...over,
});

describe("providerCloseRows", () => {
    it("keeps a fully credit-funded provider at zero cash cost", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud({ credit: -100 })],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("credit/free");
        expect(row.retainedRevenueUsd).toBe(100);
        expect(row.billedUsd).toBe(0);
        expect(row.creditFreeUsd).toBe(100);
        expect(row.netCashContributionUsd).toBe(100);
        expect(row.models[0].paidComputeCashUsd).toBe(0);
        expect(row.models[0].netCashContributionUsd).toBe(100);
    });

    it("matches a billed provider to an adjacent-month Wise payment", () => {
        const [row] = providerCloseRows(
            data({
                opTransactions: [transaction()],
                opCloud: [cloud({ vendor: "aws", paid: -100 })],
                opPollen: [pollen({ vendor: "aws" })],
            }),
        );

        expect(row.closeStatus).toBe("ready");
        expect(row.fundingStatus).toBe("billed");
        expect(row.billedUsd).toBe(100);
        expect(row.wiseCashUsd).toBe(100);
        expect(row.wiseCashMonth).toBe("2026-07");
        expect(row.netCashContributionUsd).toBe(0);
    });

    it("does not infer a payable cost from usage without a statement", () => {
        const [row] = providerCloseRows(data({ opPollen: [pollen()] }));

        expect(row.closeStatus).toBe("needs provider check");
        expect(row.fundingStatus).toBe("needs check");
        expect(row.billedUsd).toBeNull();
        expect(row.netCashContributionUsd).toBeNull();
        expect(row.models[0].paidComputeCashUsd).toBeNull();
        expect(row.models[0].paidContributionUsd).toBeNull();
        expect(row.models[0].questCashSubsidyUsd).toBeNull();
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

    it("requires a payment match when a provider statement is payable", () => {
        const [row] = providerCloseRows(
            data({
                opCloud: [cloud({ paid: -60, credit: -40 })],
                opPollen: [pollen()],
            }),
        );

        expect(row.closeStatus).toBe("needs payment match");
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
        expect(row.retainedRevenueUsd).toBe(75);
        expect(row.netCashContributionUsd).toBe(75);
        expect(row.models[0].paidComputeCashUsd).toBe(0);
    });

    it("summarizes known cash contribution without hiding unknown rows", () => {
        const rows = providerCloseRows(
            data({
                opCloud: [cloud({ credit: -100 })],
                opPollen: [pollen(), pollen({ vendor: "openai" })],
            }),
        );
        const summary = providerCloseSummary(rows);

        expect(summary.rows).toBe(2);
        expect(summary.ready).toBe(1);
        expect(summary.needsAttention).toBe(1);
        expect(summary.netCashContributionUsd).toBe(100);
        expect(summary.unknownContributionRows).toBe(1);
    });
});
