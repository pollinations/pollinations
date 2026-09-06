import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import {
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "./modelReconcile";

const cloud = (over: Partial<OpCloudRow> = {}): OpCloudRow => ({
    entry_id: "cloud-test",
    source: "provider",
    vendor: "aws",
    type: "inference",
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "provider display label",
    evidence: "provider statement",
    recorded_at: "2026-08-10 00:00:00",
    ...over,
});

const pollen = (over: Partial<OpPollenRow> = {}): OpPollenRow => ({
    source: "tinybird",
    month: "2026-07",
    vendor: "bedrock",
    model: "claude",
    currency: "POLLEN",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 0,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 0,
    requests_quests: 0,
    ...over,
});

const data = (over: Partial<Data>): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    ...over,
});

describe("modelReconcileRows", () => {
    it("splits paid and Quest traffic through cash and credit funding", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [cloud({ paid: -80, credit: -20 })],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 60,
                        cost_quests: 15,
                        price_paid: 100,
                        price_quests: 20,
                        byop_paid: 5,
                        model_paid: 5,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 20,
                        cost_quests: 5,
                        price_paid: 40,
                        price_quests: 10,
                    }),
                ],
            }),
        );

        expect(row.month).toBe("2026-07");
        expect(row.vendor).toBe("aws");
        expect(row.status).toBe("both sources");
        expect(row.paidPollenUsd).toBe(140);
        expect(row.questPollenUsd).toBe(30);
        expect(row.retainedPaidUsd).toBe(130);
        expect(row.pollenMeterUsd).toBe(100);
        expect(row.providerCashUsd).toBe(80);
        expect(row.providerCreditUsd).toBe(20);
        expect(row.meterGapUsd).toBe(0);
        expect(row.paidProviderCashUsd).toBe(64);
        expect(row.questProviderCashUsd).toBe(16);
        expect(row.paidProviderCreditUsd).toBe(16);
        expect(row.questProviderCreditUsd).toBe(4);
        expect(row.paidPollenOnCreditsUsd).toBe(28);
        expect(row.questPollenOnCreditsUsd).toBe(6);
        expect(row.paidContributionUsd).toBe(66);
        expect(row.questCashSubsidyUsd).toBe(16);
        expect(row.netCashContributionUsd).toBe(50);

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("allocated models missing");
        expect(claude.paidPollenUsd).toBe(100);
        expect(claude.questPollenUsd).toBe(20);
        expect(claude.providerCashUsd).toBe(60);
        expect(claude.providerCreditUsd).toBe(15);
        expect(claude.paidProviderCashUsd).toBe(48);
        expect(claude.questProviderCashUsd).toBe(12);
        expect(claude.paidProviderCreditUsd).toBe(12);
        expect(claude.questProviderCreditUsd).toBe(3);
        expect(claude.paidPollenOnCreditsUsd).toBe(20);
        expect(claude.questPollenOnCreditsUsd).toBe(4);
        expect(claude.paidContributionUsd).toBe(42);
        expect(claude.questCashSubsidyUsd).toBe(12);
        expect(claude.netCashContributionUsd).toBe(30);
        expect(nova.providerCashUsd).toBe(20);
        expect(nova.providerCreditUsd).toBe(5);
        expect(nova.paidContributionUsd).toBe(24);
        expect(nova.questCashSubsidyUsd).toBe(4);
        expect(nova.netCashContributionUsd).toBe(20);
        expect(
            row.models.reduce(
                (sum, model) => sum + (model.providerCashUsd ?? 0),
                0,
            ),
        ).toBe(row.providerCashUsd);
        expect(
            row.models.reduce(
                (sum, model) => sum + (model.providerCreditUsd ?? 0),
                0,
            ),
        ).toBe(row.providerCreditUsd);
    });

    it("uses complete canonical model funding instead of proportional allocation", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        entry_id: "claude-input",
                        model: "claude",
                        paid: -70,
                    }),
                    cloud({
                        entry_id: "claude-output",
                        model: "claude",
                        paid: -20,
                    }),
                    cloud({
                        entry_id: "nova",
                        model: "nova",
                        paid: -10,
                    }),
                ],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 60,
                        price_paid: 120,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 40,
                        price_paid: 50,
                    }),
                ],
            }),
        );

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("direct models missing");
        expect(claude.providerCashUsd).toBe(90);
        expect(claude.meterGapUsd).toBe(30);
        expect(nova.providerCashUsd).toBe(10);
        expect(nova.meterGapUsd).toBe(-30);
        expect(row.paidProviderCashUsd).toBe(100);
    });

    it("falls back to provider-month allocation when canonical model coverage is incomplete", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        model: "claude",
                        paid: -100,
                    }),
                ],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 50,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 50,
                    }),
                ],
            }),
        );

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("fallback models missing");
        expect(claude.providerCashUsd).toBe(50);
        expect(nova.providerCashUsd).toBe(50);
    });

    it("identifies paid and Quest Pollen spent on credit-funded usage", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [cloud({ paid: -25, credit: -75 })],
                opPollen: [
                    pollen({
                        cost_paid: 60,
                        cost_quests: 40,
                        price_paid: 120,
                        price_quests: 80,
                        byop_paid: 20,
                    }),
                ],
            }),
        );

        expect(row.paidPollenOnCreditsUsd).toBe(90);
        expect(row.questPollenOnCreditsUsd).toBe(60);
        expect(row.paidProviderCashUsd).toBe(15);
        expect(row.questProviderCashUsd).toBe(10);
        expect(row.paidProviderCreditUsd).toBe(45);
        expect(row.questProviderCreditUsd).toBe(30);
        expect(row.paidContributionUsd).toBe(85);
        expect(row.questCashSubsidyUsd).toBe(10);
        expect(row.netCashContributionUsd).toBe(75);

        const summary = modelReconcileSummary([row]);
        expect(summary.paidPollenOnCreditsUsd).toBe(90);
        expect(summary.questPollenOnCreditsUsd).toBe(60);
        expect(summary.paidContributionUsd).toBe(85);
        expect(summary.questCashSubsidyUsd).toBe(10);
        expect(summary.netCashContributionUsd).toBe(75);
    });

    it("allocates each month separately instead of blending periods", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ paid: -100 }),
                    cloud({
                        start: "2026-08-01 00:00:00",
                        end: "2026-09-01 00:00:00",
                        paid: -300,
                    }),
                ],
                opPollen: [
                    pollen({ cost_paid: 50 }),
                    pollen({ month: "2026-08", cost_paid: 300 }),
                ],
            }),
        );

        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.month === "2026-07")?.meterGapUsd).toBe(
            50,
        );
        expect(rows.find((row) => row.month === "2026-08")?.meterGapUsd).toBe(
            0,
        );
    });

    it("keeps missing provider data unknown instead of turning it into zero", () => {
        const [row] = modelReconcileRows(
            data({ opPollen: [pollen({ cost_paid: 25, price_paid: 30 })] }),
        );

        expect(row.status).toBe("pollen only");
        expect(row.providerCashUsd).toBeNull();
        expect(row.providerCreditUsd).toBeNull();
        expect(row.meterGapUsd).toBeNull();
        expect(row.paidPollenOnCreditsUsd).toBeNull();
        expect(row.netCashContributionUsd).toBeNull();
        expect(row.models[0].status).toBe("missing provider");
    });

    it("shows provider usage without Pollen as unallocated", () => {
        const [row] = modelReconcileRows(
            data({ opCloud: [cloud({ vendor: "modal", paid: -42 })] }),
        );

        expect(row.status).toBe("provider only");
        expect(row.pollenMeterUsd).toBeNull();
        expect(row.providerUsageUsd).toBe(42);
        expect(row.models).toEqual([
            expect.objectContaining({
                model: "Unallocated vendor usage",
                status: "unallocated",
                providerCashUsd: 42,
            }),
        ]);
    });

    it("keeps provider usage unallocated when the Pollen cost weights are zero", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [cloud({ paid: -20, credit: -80 })],
                opPollen: [
                    pollen({
                        cost_paid: 0,
                        cost_quests: 0,
                        price_paid: 50,
                        price_quests: 10,
                    }),
                ],
            }),
        );

        expect(row.status).toBe("both sources");
        expect(row.paidProviderCashUsd).toBeNull();
        expect(row.questProviderCashUsd).toBeNull();
        expect(row.paidPollenOnCreditsUsd).toBe(40);
        expect(row.questPollenOnCreditsUsd).toBe(8);
        expect(row.paidContributionUsd).toBeNull();
        expect(row.questCashSubsidyUsd).toBeNull();
        expect(row.netCashContributionUsd).toBe(30);
        expect(row.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    model: "claude",
                    status: "unallocated",
                }),
                expect.objectContaining({
                    model: "Unallocated vendor usage",
                    providerCashUsd: 20,
                    providerCreditUsd: 80,
                }),
            ]),
        );
    });

    it("ignores infrastructure and grant awards but preserves paid refunds", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ vendor: "azure", credit: 10_000 }),
                    cloud({ vendor: "cloudflare", type: "infra", paid: -50 }),
                    cloud({ vendor: "aws", paid: -100 }),
                    cloud({ vendor: "aws", paid: 10, source: "refund" }),
                ],
                opPollen: [pollen({ cost_paid: 90, price_paid: 100 })],
            }),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].providerCashUsd).toBe(90);
        expect(rows[0].meterGapUsd).toBe(0);
    });

    it("filters after preserving month-provider grain and summarizes holes", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ paid: -50 }),
                    cloud({ vendor: "modal", paid: -20 }),
                ],
                opPollen: [
                    pollen({ cost_paid: 40, price_paid: 60 }),
                    pollen({ vendor: "openai", cost_paid: 10 }),
                ],
            }),
        );
        const visible = visibleModelReconcileRows({
            rows,
            month: "2026-07",
            vendor: ["aws", "openai"],
        });
        const summary = modelReconcileSummary(visible);

        expect(visible.map((row) => row.vendor)).toEqual(["aws", "openai"]);
        expect(summary.providerMonths).toBe(2);
        expect(summary.missingSideProviderMonths).toBe(1);
        expect(summary.paidPollenUsd).toBe(60);
        expect(summary.questPollenUsd).toBe(0);
        expect(summary.retainedPaidUsd).toBe(60);
        expect(summary.pollenMeterUsd).toBe(50);
        expect(summary.providerUsageUsd).toBe(50);
        expect(summary.meterGapUsd).toBe(10);
        expect(summary.paidPollenOnCreditsUsd).toBe(0);
        expect(summary.questPollenOnCreditsUsd).toBe(0);
        expect(summary.paidContributionUsd).toBe(10);
        expect(summary.questCashSubsidyUsd).toBe(0);
        expect(summary.netCashContributionUsd).toBe(10);
        expect(summary.pollenOnlyMeterUsd).toBe(10);
    });
});
