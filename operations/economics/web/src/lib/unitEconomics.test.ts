import { describe, expect, it } from "vitest";
import type { Data, OpPollenRow, VendorLedgerRow } from "../types";
import { dataConfidence } from "./dataConfidence";
import { modelReconcileRows } from "./modelReconcile";
import {
    matchesSituation,
    meterMatchPct,
    providerCostCheck,
    type UnitEconomicsRow,
    unitEconomicsReport,
    unitEconomicsRows,
    unitPerformancePct,
} from "./unitEconomics";

const cloud = (over: Partial<VendorLedgerRow> = {}): VendorLedgerRow => ({
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
    vendorLedger: [],
    opPollen: [],
    ...over,
});

const economicsRow = (
    over: Partial<UnitEconomicsRow> = {},
): UnitEconomicsRow => ({
    grain: "provider",
    month: "2026-07",
    vendor: "openai",
    model: "All models",
    sourceStatus: "both sources",
    allocationStatus: null,
    economicContributionUsd: 0,
    paidPollenUsd: 0,
    questPollenUsd: 0,
    retainedPaidUsd: 0,
    pollenMeterUsd: 100,
    providerCashUsd: 100,
    providerCreditUsd: 0,
    providerUsageUsd: 100,
    paidPollenOnCreditsUsd: 0,
    questPollenOnCreditsUsd: 0,
    meterGapUsd: 0,
    paidContributionUsd: 0,
    questCashSubsidyUsd: 0,
    netCashContributionUsd: 0,
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
                vendorLedger: [
                    cloud({ model: "claude", paid: -80, credit: -20 }),
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
            "anthropic/claude-sonnet-4.6",
            "llama",
            "Needs model mapping",
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
            if (models.every((row) => row.allocationStatus === "allocated")) {
                expect(
                    sum(models.map((row) => row.netCashContributionUsd)),
                ).toBeCloseTo(provider.netCashContributionUsd ?? 0);
                expect(
                    sum(models.map((row) => row.economicContributionUsd)),
                ).toBeCloseTo(provider.economicContributionUsd ?? 0);
            } else {
                const unmatched = models.find(
                    (row) => row.paidPollenUsd != null,
                );
                expect(unmatched?.netCashContributionUsd).toBeNull();
                expect(unmatched?.economicContributionUsd).toBeNull();
            }
            expect(
                (provider.netCashContributionUsd ?? 0) -
                    (provider.economicContributionUsd ?? 0),
            ).toBeCloseTo(provider.providerCreditUsd ?? 0);
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
                vendorLedger: [
                    cloud({ model: "claude", paid: -10 }),
                    cloud({
                        start: "2026-08-01 00:00:00",
                        end: "2026-09-01 00:00:00",
                        model: "claude",
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

describe("unit-economics outcomes", () => {
    it("compares full-cost result with retained Paid", () => {
        expect(unitPerformancePct(25, 100)).toBe(25);
        expect(unitPerformancePct(-25, 100)).toBe(-25);
        expect(unitPerformancePct(-25, 0)).toBeNull();
        expect(unitPerformancePct(null, 100)).toBeNull();
    });
});

describe("providerCostCheck", () => {
    it("reviews direct providers only when both drift thresholds are exceeded", () => {
        expect(
            providerCostCheck(
                economicsRow({ providerUsageUsd: 150, meterGapUsd: 50 }),
            ).kind,
        ).toBe("healthy");
        expect(
            providerCostCheck(
                economicsRow({ providerUsageUsd: 250, meterGapUsd: 150 }),
            ).kind,
        ).toBe("review");
    });

    it("describes capacity, mixed, and direct bases without false alarms", () => {
        expect(
            providerCostCheck(
                economicsRow({
                    vendor: "lambda",
                    pollenMeterUsd: 50,
                    providerUsageUsd: 200,
                }),
            ),
        ).toMatchObject({ kind: "utilization", value: 25 });
        expect(
            providerCostCheck(
                economicsRow({ vendor: "aws", providerUsageUsd: 120 }),
            ),
        ).toMatchObject({ kind: "calibration", value: 1.2 });
        expect(
            providerCostCheck(economicsRow({ vendor: "inferenceport" })).kind,
        ).toBe("healthy");
    });

    it("keeps source holes and model allocations distinct", () => {
        expect(
            providerCostCheck(
                economicsRow({
                    sourceStatus: "pollen only",
                    providerUsageUsd: null,
                }),
            ).kind,
        ).toBe("missing-source");
        expect(providerCostCheck(economicsRow({ grain: "model" })).kind).toBe(
            "provider-level",
        );
        expect(
            providerCostCheck(economicsRow({ vendor: "new-provider" })).kind,
        ).toBe("missing-mapping");
    });
});

describe("matchesSituation", () => {
    const row = (over: Partial<UnitEconomicsRow>): UnitEconomicsRow =>
        ({
            grain: "model",
            month: "2026-08",
            vendor: "azure",
            model: "x",
            allocationStatus: "allocated",
            sourceStatus: "both sources",
            members: null,
            lines: null,
            ...over,
        }) as UnitEconomicsRow;

    it("maps each chip to the rows it summarises", () => {
        const assigned = row({ allocationStatus: "allocated" });
        const grouped = row({
            allocationStatus: "allocated",
            members: ["openai-large", "midijourney-large"],
        });
        const breakdown = row({ allocationStatus: "missing breakdown" });
        const mapping = row({ allocationStatus: "needs mapping" });
        const noModel = row({ allocationStatus: "provider only" });
        const rows = [assigned, grouped, breakdown, mapping, noModel];

        expect(rows.filter((r) => matchesSituation(r, "all"))).toEqual(rows);
        expect(rows.filter((r) => matchesSituation(r, "assigned"))).toEqual([
            assigned,
            grouped,
        ]);
        expect(rows.filter((r) => matchesSituation(r, "grouped"))).toEqual([
            grouped,
        ]);
        expect(
            rows.filter((r) => matchesSituation(r, "missing breakdown")),
        ).toEqual([breakdown]);
        expect(
            rows.filter((r) => matchesSituation(r, "needs mapping")),
        ).toEqual([mapping]);
        expect(
            rows.filter((r) => matchesSituation(r, "no Pollen model")),
        ).toEqual([noModel]);
    });
});

describe("shared result completeness", () => {
    const month = "2026-07";
    const report = (over: Partial<Data>) =>
        unitEconomicsReport(data(over), month, "inference");
    it("keeps a small provider-only charge unknown until usage is explicitly recorded", () => {
        const vendorLedger = [cloud({ vendor: "openai", paid: -0.66 })];
        const missing = report({ vendorLedger });
        expect(missing.currentResultUsd).toBeNull();
        expect(missing.fullCostResultUsd).toBeNull();
        expect(missing.blockers).toMatchObject([
            { vendor: "openai", kind: "usage", amountUsd: 0.66 },
        ]);
        const zeroUsage = report({
            vendorLedger,
            opPollen: [pollen({ vendor: "openai" })],
        });
        expect(zeroUsage.blockers).toEqual([]);
        expect(zeroUsage.fullCostResultUsd).toBe(-0.66);
        expect(zeroUsage.summary.providerUsageUsd).toBe(
            missing.summary.providerUsageUsd,
        );
    });
    it("resolves missing costs only from the same month's vendor records", () => {
        const opPollen = [
            pollen({ vendor: "openai", price_paid: 100, cost_paid: 50 }),
        ];
        expect(
            report({
                opPollen,
                vendorLedger: [
                    cloud({ vendor: "openai", start: "2026-06-01", paid: -50 }),
                ],
            }).blockers[0].kind,
        ).toBe("costs");
        const complete = report({
            opPollen,
            vendorLedger: [cloud({ vendor: "openai", paid: -30, credit: -20 })],
        });
        expect(complete.blockers).toEqual([]);
        expect(complete.currentResultUsd).toBe(70);
        expect(complete.fullCostResultUsd).toBe(50);
    });
    it("does not block provider totals for missing model detail or documents", () => {
        const complete = report({
            vendorLedger: [
                cloud({
                    vendor: "openai",
                    model: "unresolved-invoice-name",
                    paid: -50,
                    evidence: "",
                }),
            ],
            opPollen: [
                pollen({
                    vendor: "openai",
                    model: "openai/gpt-4o",
                    price_paid: 100,
                }),
            ],
        });
        expect(complete.summary.buckets.needsMappingUsd).toBe(50);
        expect(complete.blockers).toEqual([]);
        expect(complete.fullCostResultUsd).toBe(50);
    });
    it("blocks ambiguous delivery only for inference, keeping provider totals usable", () => {
        const mixed = data({
            vendorLedger: [
                cloud({ vendor: "modal", paid: -20 }),
                cloud({ vendor: "modal", type: "gpu", paid: -30 }),
            ],
            opPollen: [pollen({ vendor: "modal", price_paid: 100 })],
        });
        expect(report(mixed).blockers.map((b) => b.kind)).toEqual(["delivery"]);
        expect(
            unitEconomicsReport(mixed, month, "vendors").fullCostResultUsd,
        ).toBe(50);
    });
    it("accepts explicitly recorded zero costs and zero usage", () => {
        const zero = report({
            vendorLedger: [cloud({ vendor: "openai" })],
            opPollen: [pollen({ vendor: "openai" })],
        });
        expect(zero.blockers).toEqual([]);
        expect(zero.currentResultUsd).toBe(0);
        expect(zero.fullCostResultUsd).toBe(0);
    });
    it("reports an empty period instead of treating absent ledgers as zero", () => {
        expect(report({}).blockers).toMatchObject([{ month, kind: "period" }]);
        expect(report({}).fullCostResultUsd).toBeNull();
    });
});

describe("data confidence from shared source checks", () => {
    const month = "2026-07";
    const report = (over: Partial<Data>) =>
        unitEconomicsReport(data(over), month, "inference");

    it("measures recorded-cost coverage without rounding a tiny gap to complete", () => {
        const result = report({
            vendorLedger: [
                cloud({ vendor: "openai", paid: -10000 }),
                cloud({ vendor: "modal", paid: -0.19 }),
            ],
            opPollen: [pollen({ vendor: "openai", price_paid: 12000 })],
        });
        const before = JSON.stringify(result);
        const confidence = dataConfidence([], result);
        expect(confidence.status).toBe("Partial");
        expect(confidence.detail).toContain("99%");
        expect(confidence.detail).toContain("$0.19 has no matching usage");
        expect(confidence.detail).not.toContain("<$1");
        expect(result.currentResultUsd).toBeCloseTo(1999.81);
        expect(result.fullCostResultUsd).toBeCloseTo(1999.81);
        expect(result.provisional).toBe(true);
        expect(confidence.detail).toContain("results use recorded figures");
        expect(
            result.vendorMonths.find((row) => row.vendor === "modal")
                ?.paidPollenUsd,
        ).toBeNull();
        expect(JSON.stringify(result)).toBe(before);
    });

    it("never gives missing costs, ambiguous delivery or an empty period a percentage", () => {
        for (const result of [
            report({
                opPollen: [pollen({ vendor: "openai", price_paid: 100 })],
            }),
            report({
                vendorLedger: [
                    cloud({ vendor: "modal", paid: -20 }),
                    cloud({ vendor: "modal", type: "gpu", paid: -30 }),
                ],
                opPollen: [pollen({ vendor: "modal", price_paid: 100 })],
            }),
            report({}),
        ]) {
            expect(dataConfidence([], result).status).toBe("Incomplete");
            expect(dataConfidence([], result).detail).not.toContain("%");
        }
    });

    it("recognizes explicit zero usage and preserves the cost", () => {
        const result = report({
            vendorLedger: [cloud({ vendor: "openai", paid: -0.19 })],
            opPollen: [pollen({ vendor: "openai" })],
        });
        expect(dataConfidence([], result).status).toBe("Complete for totals");
        expect(result.fullCostResultUsd).toBe(-0.19);
        expect(dataConfidence([]).status).toBe("No flagged issues");
        expect(dataConfidence([]).detail).not.toContain("%");
    });
});

it("includes unmatched cash and credit costs in provisional results until actual usage arrives", () => {
    const input = data({
        vendorLedger: [
            cloud({ vendor: "openai", paid: -30, credit: -20 }),
            cloud({ vendor: "modal", paid: -3, credit: -7 }),
        ],
        opPollen: [pollen({ vendor: "openai", price_paid: 100 })],
    });
    const recorded = unitEconomicsReport(input, "2026-07", "inference");
    expect(recorded.provisional).toBe(true);
    expect(recorded.currentResultUsd).toBe(67);
    expect(recorded.fullCostResultUsd).toBe(40);
    expect(recorded.blockers).toMatchObject([
        { vendor: "modal", kind: "usage" },
    ]);
    const completed = unitEconomicsReport(
        {
            ...input,
            opPollen: [
                ...(input.opPollen ?? []),
                pollen({ vendor: "modal", price_paid: 5 }),
            ],
        },
        "2026-07",
        "inference",
    );
    expect(completed.provisional).toBe(false);
    expect(completed.currentResultUsd).toBe(72);
    expect(completed.fullCostResultUsd).toBe(45);
    expect(completed.blockers).toEqual([]);
    expect(completed.summary.providerUsageUsd).toBe(
        recorded.summary.providerUsageUsd,
    );
});
