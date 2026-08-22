import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import { modelReconcileRows } from "./modelReconcile";
import { meterMatchPct, unitEconomicsRows } from "./unitEconomics";

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
    opRunway: [],
    ...over,
});

function sum(values: readonly (number | null)[]): number | null {
    return values.every((value) => value == null)
        ? null
        : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

describe("unitEconomicsRows", () => {
    it("shows every model directly and keeps provider rollups additive", () => {
        const providers = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ paid: -80, credit: -20 }),
                    cloud({ vendor: "lambda", paid: -30, credit: -70 }),
                ],
                opPollen: [
                    pollen({
                        cost_paid: 60,
                        cost_quests: 40,
                        price_paid: 120,
                        price_quests: 80,
                    }),
                    pollen({
                        vendor: "lambda",
                        model: "llama",
                        price_paid: 50,
                    }),
                ],
            }),
        );
        const providerRows = unitEconomicsRows(providers, "provider");
        const modelRows = unitEconomicsRows(providers, "model");

        expect(providerRows).toHaveLength(2);
        expect(providerRows.every((row) => row.model === "All models")).toBe(
            true,
        );
        expect(modelRows.map((row) => row.model)).toEqual([
            "claude",
            "llama",
            "Unallocated provider usage",
        ]);

        for (const provider of providerRows) {
            const models = modelRows.filter(
                (row) =>
                    row.month === provider.month &&
                    row.vendor === provider.vendor,
            );
            expect(sum(models.map((row) => row.paidPollenUsd))).toBeCloseTo(
                provider.paidPollenUsd ?? 0,
            );
            expect(sum(models.map((row) => row.questPollenUsd))).toBeCloseTo(
                provider.questPollenUsd ?? 0,
            );
            expect(sum(models.map((row) => row.providerCashUsd))).toBeCloseTo(
                provider.providerCashUsd ?? 0,
            );
            expect(sum(models.map((row) => row.providerCreditUsd))).toBeCloseTo(
                provider.providerCreditUsd ?? 0,
            );
            expect(sum(models.map((row) => row.pollenMeterUsd))).toBeCloseTo(
                provider.pollenMeterUsd ?? 0,
            );
            expect(
                sum(models.map((row) => row.netCashContributionUsd)),
            ).toBeCloseTo(provider.netCashContributionUsd ?? 0);
        }
    });

    it("measures meter match without treating missing data as zero", () => {
        expect(meterMatchPct(80, 100)).toBe(80);
        expect(meterMatchPct(100, 80)).toBe(80);
        expect(meterMatchPct(100, null)).toBeNull();
        expect(meterMatchPct(null, 100)).toBeNull();
        expect(meterMatchPct(0, 0)).toBeNull();
    });

    it("keeps months separate in both grains", () => {
        const providers = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ paid: -10 }),
                    cloud({
                        start: "2026-08-01 00:00:00",
                        end: "2026-09-01 00:00:00",
                        paid: -20,
                    }),
                ],
                opPollen: [
                    pollen({ cost_paid: 10, price_paid: 15 }),
                    pollen({
                        month: "2026-08",
                        cost_paid: 20,
                        price_paid: 30,
                    }),
                ],
            }),
        );

        expect(
            unitEconomicsRows(providers, "provider").map((row) => row.month),
        ).toEqual(["2026-08", "2026-07"]);
        expect(
            unitEconomicsRows(providers, "model").map((row) => row.month),
        ).toEqual(["2026-08", "2026-07"]);
    });
});
