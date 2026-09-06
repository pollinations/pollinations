import { describe, expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import {
    allocateGrants,
    creditRunway,
    providerBalanceRows,
} from "./providerBalances";
import { vendorPlanes } from "./vendorReconciliation";

const opTxn = (over: Partial<OpTransactionRow>): OpTransactionRow => ({
    entry_id: "wise-test-transaction",
    kind: "transaction",
    source: "wise",
    date: "2026-05-10",
    vendor: "aws",
    category: "cloud",
    amount: 0,
    currency: "USD",
    description: "",
    evidence: "",
    recorded_at: "2026-07-09 00:00:00",
    ...over,
});

const opCloud = (over: Partial<OpCloudRow>): OpCloudRow => ({
    entry_id: "cloud-test",
    source: "api",
    vendor: "aws",
    type: "inference",
    start: "2026-05-01 00:00:00",
    end: "2026-06-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "",
    evidence: "",
    recorded_at: "2026-07-09 00:00:00",
    ...over,
});

const opPollen = (over: Partial<OpPollenRow>): OpPollenRow => ({
    source: "tinybird",
    month: "2026-06",
    vendor: "google",
    model: "gemini-2.5-flash",
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

const emptyData = (over: Partial<Data>): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    privateConfig: PRIVATE_CONFIG_FIXTURE,
    ...over,
});

describe("vendorPlanes", () => {
    it("aligns the OP planes on (month, vendor) and converts currencies", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "google",
                    category: "cloud",
                    amount: -5000,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-06-14",
                    vendor: "google-workspace",
                    category: "saas",
                    amount: -999,
                    currency: "USD",
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    end: "2026-07-01 00:00:00",
                    vendor: "google",
                    currency: "EUR",
                    credit: -100,
                    paid: -4389.35,
                }),
            ],
            opPollen: [
                opPollen({
                    vendor: "google",
                    cost_paid: 3000,
                    cost_quests: 1940,
                }),
            ],
        });
        const [row] = vendorPlanes(data);

        expect(row.month).toBe("2026-06");
        expect(row.vendor).toBe("google");
        expect(row.cashUsd).toBe(5000); // Operations row excluded - compute only
        expect(row.cloudPaidUsd).toBeCloseTo(4389.35 * 1.1518, 1);
        expect(row.cloudCreditUsd).toBeCloseTo(100 * 1.1518, 2);
        expect(row.cloudUsd).toBeCloseTo(4489.35 * 1.1518, 1);
        expect(row.meterCloudUsd).toBeCloseTo(4489.35 * 1.1518, 1);
        expect(row.pollenPaidCostUsd).toBe(3000);
        expect(row.pollenQuestCostUsd).toBe(1940);
        expect(row.pollenCostUsd).toBe(4940);
        expect(row.calibX).toBeCloseTo((4489.35 * 1.1518) / 4940, 5);
        expect(row.cashCoverage).toBe("same month");
        expect(row.meterCoverage).toBe("complete");
        expect(row.status).toBe("ok");
    });

    it("keeps missing planes null instead of zero", () => {
        const data = emptyData({
            opPollen: [opPollen({ vendor: "runpod", cost_paid: 10 })],
        });
        const [row] = vendorPlanes(data);
        expect(row.cashUsd).toBeNull();
        expect(row.cloudPaidUsd).toBeNull();
        expect(row.cloudCreditUsd).toBeNull();
        expect(row.cloudUsd).toBeNull();
        expect(row.meterCloudUsd).toBeNull();
        expect(row.pollenPaidCostUsd).toBe(10);
        expect(row.pollenQuestCostUsd).toBeNull();
        expect(row.pollenCostUsd).toBe(10);
        expect(row.calibX).toBeNull();
        expect(row.meterCoverage).toBe("missing cloud");
        expect(row.status).toBe("missing cloud");
    });

    it("does not require an external cloud bill for Pollen-priced providers", () => {
        const data = emptyData({
            opPollen: [
                opPollen({
                    vendor: "bpai",
                    model: "klein",
                    cost_paid: 10,
                    price_paid: 10,
                }),
                opPollen({
                    vendor: "self-hosted",
                    model: "acestep",
                    cost_paid: 5,
                    price_paid: 5,
                }),
            ],
        });

        expect(
            vendorPlanes(data).map((row) => ({
                vendor: row.vendor,
                coverage: row.meterCoverage,
                status: row.status,
            })),
        ).toEqual([
            { vendor: "bpai", coverage: "complete", status: "ok" },
            { vendor: "self-hosted", coverage: "complete", status: "ok" },
        ]);
    });

    it("skips OP transactions with a malformed month key", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "",
                    vendor: "aws",
                    category: "cloud",
                    amount: -500,
                    currency: "USD",
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("excludes pre-window OP Cloud rows from display", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2025-12-01 00:00:00",
                    vendor: "aws",
                    credit: -35000,
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("keeps infra-only cloud burn out of data quality", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "cloudflare",
                    category: "cloud",
                    amount: -1073,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "cloudflare",
                    type: "infra",
                    paid: -1073,
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("keeps infra cloud burn out of mixed data quality rows", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "runpod",
                    category: "cloud",
                    amount: -90,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "runpod",
                    type: "infra",
                    paid: -20,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "runpod",
                    type: "gpu",
                    paid: -70,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "runpod",
                    cost_paid: 70,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.vendor).toBe("runpod");
        expect(row.cloudPaidUsd).toBe(70);
        expect(row.cloudUsd).toBe(70);
        expect(row.meterCloudUsd).toBe(70);
        expect(row.cashCoverage).toBe("same month");
        expect(row.meterCoverage).toBe("complete");
        expect(row.status).toBe("ok");
    });

    it("ignores positive OP Cloud grant awards as spend", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "aws",
                    credit: 1000,
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("excludes community publisher rewards from provider reconciliation", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    vendor: "community",
                    credit: -1_000,
                }),
            ],
            opPollen: [
                opPollen({
                    vendor: "community",
                    cost_paid: 0,
                    cost_quests: 0,
                }),
            ],
        });

        expect(vendorPlanes(data)).toEqual([]);
    });
});

describe("data quality status", () => {
    it("classifies same-month, credit-funded, adjacent-cash, and missing-cloud rows", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "google",
                    category: "cloud",
                    amount: -5000,
                }),
                opTxn({
                    date: "2026-05-11",
                    vendor: "aws",
                    category: "cloud",
                    amount: -4044,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    paid: -4000,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "azure",
                    credit: -3000,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "aws",
                    paid: -4698,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 4000,
                }),
                opPollen({
                    month: "2026-06",
                    vendor: "azure",
                    cost_paid: 4000,
                }),
                opPollen({
                    month: "2026-06",
                    vendor: "aws",
                    cost_paid: 4698,
                }),
                opPollen({
                    month: "2026-06",
                    vendor: "openrouter",
                    cost_paid: 1000,
                }),
            ],
        });
        const byKey = new Map(
            vendorPlanes(data).map((row) => [
                `${row.month}|${row.vendor}`,
                {
                    cash: row.cashCoverage,
                    meter: row.meterCoverage,
                    status: row.status,
                },
            ]),
        );
        expect(byKey.get("2026-06|google")).toEqual({
            cash: "same month",
            meter: "complete",
            status: "ok",
        });
        expect(byKey.get("2026-06|azure")).toEqual({
            cash: "credit funded",
            meter: "complete",
            status: "ok",
        });
        expect(byKey.get("2026-06|aws")).toEqual({
            cash: "cash ±1mo",
            meter: "complete",
            status: "timing",
        });
        expect(byKey.get("2026-06|openrouter")).toEqual({
            cash: null,
            meter: "missing cloud",
            status: "missing cloud",
        });
    });

    it("flags paid OP Cloud burn without cash", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-05-01 00:00:00",
                    vendor: "replicate",
                    paid: -36.26,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.cashCoverage).toBe("missing cash");
        expect(row.status).toBe("missing cash");
    });

    it("separates explained historical one-sided rows from unresolved gaps", () => {
        const explained = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-02-13",
                    vendor: "vast.ai",
                    category: "cloud",
                    amount: -10,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-02-01 00:00:00",
                    vendor: "vast.ai",
                    paid: -10,
                }),
            ],
        });
        const [explainedRow] = vendorPlanes(explained);
        expect(explainedRow.meterCoverage).toBe("missing pollen");
        expect(explainedRow.status).toBe("explained");
        expect(explainedRow.reconciliationExplanation?.reason).toBe(
            "provider_attribution_transition",
        );

        const historicalException = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-02-01 00:00:00",
                    vendor: "pruna",
                    credit: -2,
                }),
            ],
        });
        const [historicalExceptionRow] = vendorPlanes(historicalException);
        expect(historicalExceptionRow.meterCoverage).toBe("missing pollen");
        expect(historicalExceptionRow.status).toBe("explained");
        expect(historicalExceptionRow.reconciliationExplanation?.reason).toBe(
            "unverifiable_history",
        );
    });

    it("never alarms on sub-dollar OP Cloud paid amounts", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-01-01 00:00:00",
                    vendor: "elevenlabs",
                    paid: -0.49,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.cashCoverage).toBeNull();
        expect(row.meterCoverage).toBeNull();
        expect(row.status).toBe("ok");
    });

    it("covers prepaid vendors while cumulative top-ups keep up with burn", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-04-02",
                    vendor: "vast.ai",
                    category: "cloud",
                    amount: -500,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "vast.ai",
                    paid: -66,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "vast.ai",
                    cost_paid: 66,
                }),
            ],
        });
        const rows = vendorPlanes(data);
        const june = rows.find((row) => row.month === "2026-06");
        expect(june?.cashCoverage).toBe("prepaid");
        expect(june?.status).toBe("timing");
    });

    it("carries Mistral prepaid top-ups into later usage months", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-07-26",
                    vendor: "mistral",
                    category: "cloud",
                    amount: -50,
                    currency: "USD",
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-09-01 00:00:00",
                    vendor: "mistral",
                    paid: -20,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-09",
                    vendor: "mistral",
                    cost_paid: 20,
                }),
            ],
        });

        const september = vendorPlanes(data).find(
            (row) => row.month === "2026-09",
        );
        expect(september?.cashCoverage).toBe("prepaid");
        expect(september?.status).toBe("timing");
    });

    it("still alarms when a prepaid balance is overdrawn", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "vast.ai",
                    paid: -200,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.cashCoverage).toBe("missing cash");
        expect(row.status).toBe("missing cash");
    });

    it("ignores sub-dollar pollen noise", () => {
        const data = emptyData({
            opPollen: [
                opPollen({ month: "2026-06", vendor: "fal", cost_paid: 0.5 }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.meterCoverage).toBeNull();
        expect(row.status).toBe("ok");
    });

    it("treats non-zero values on both sides as complete below the noise threshold", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    vendor: "fal",
                    start: "2026-06-01 00:00:00",
                    credit: -0.93,
                }),
                opCloud({
                    vendor: "deepinfra",
                    start: "2026-06-01 00:00:00",
                    credit: -5.74,
                }),
            ],
            opPollen: [
                opPollen({ vendor: "fal", cost_paid: 10.88 }),
                opPollen({ vendor: "deepinfra", cost_paid: 0.92 }),
            ],
        });
        const rows = vendorPlanes(data);

        expect(
            rows.map((row) => ({
                vendor: row.vendor,
                coverage: row.meterCoverage,
                status: row.status,
            })),
        ).toEqual([
            { vendor: "deepinfra", coverage: "complete", status: "ok" },
            { vendor: "fal", coverage: "complete", status: "ok" },
        ]);
    });

    it("only flags calibration drift when the dollar gap is material", () => {
        const lowDollar = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "fal",
                    credit: -20,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "fal",
                    cost_paid: 5,
                }),
            ],
        });
        const [lowDollarRow] = vendorPlanes(lowDollar);
        expect(lowDollarRow.calibX).toBe(4);
        expect(lowDollarRow.status).toBe("ok");

        const material = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "fal",
                    credit: -250,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "fal",
                    cost_paid: 100,
                }),
            ],
        });
        const [materialRow] = vendorPlanes(material);
        expect(materialRow.calibX).toBe(2.5);
        expect(materialRow.meteringBasis).toBe("direct");
        expect(materialRow.status).toBe("drift");
    });

    it("keeps source-backed historical direct drift visible but non-actionable", () => {
        const historical = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-03-01 00:00:00",
                    vendor: "anthropic",
                    credit: -250,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-03",
                    vendor: "anthropic",
                    cost_paid: 100,
                }),
            ],
        });

        const [row] = vendorPlanes(historical);
        expect(row.calibX).toBe(2.5);
        expect(row.status).toBe("explained");
        expect(row.reconciliationExplanation?.reason).toBe(
            "historical_tracking_gap",
        );
    });

    it("treats material capacity mismatch as utilization variance, not price drift", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "lambda",
                    credit: -250,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "lambda",
                    cost_paid: 100,
                }),
            ],
        });

        const [row] = vendorPlanes(data);
        expect(row.meteringBasis).toBe("capacity");
        expect(row.calibX).toBe(2.5);
        expect(row.status).toBe("variance");
    });

    it("does not display transaction-only tooling vendors", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "tinybird",
                    category: "cloud",
                    amount: -225.25,
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("does not display cash-only rows for vendors that normally have product cloud meters", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-06-13",
                    vendor: "aws",
                    category: "cloud",
                    amount: -100,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-05-01 00:00:00",
                    vendor: "aws",
                    paid: -80,
                }),
            ],
        });
        expect(
            vendorPlanes(data).some((entry) => entry.month === "2026-06"),
        ).toBe(false);
    });
});

type GrantSpec = {
    vendor: string;
    label: string;
    granted: number;
    currency: string;
    start_date: string;
    expires: string;
};

const grant = (over: Partial<GrantSpec>): OpCloudRow => {
    const row = {
        vendor: "lambda",
        label: "",
        granted: 0,
        currency: "USD",
        start_date: "2026-03-01",
        expires: "1970-01-01",
        ...over,
    };
    return opCloud({
        source: "manual",
        vendor: row.vendor,
        type: "inference",
        start: `${row.start_date} 00:00:00`,
        end: row.expires === "1970-01-01" ? "" : `${row.expires} 00:00:00`,
        credit: row.granted,
        paid: 0,
        currency: row.currency,
        resource_name: row.label,
        evidence: `test grant ${row.label}`.trim(),
    });
};

const opCreditBurn = ({
    month = "2026-05",
    credit = 0,
    paid = 0,
    ...over
}: Partial<Omit<OpCloudRow, "credit" | "paid">> & {
    month?: string;
    credit?: number;
    paid?: number;
}): OpCloudRow =>
    opCloud({
        start: `${month}-01 00:00:00`,
        end: `${month}-28 00:00:00`,
        credit: -credit,
        paid: -paid,
        ...over,
    });

describe("creditRunway", () => {
    const NOW = new Date("2026-07-08T12:00:00Z"); // day 8 of July

    it("pools grants per vendor, converts EUR at the start month, and nets naive remaining", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "fireworks", label: "a", granted: 700 }),
                grant({ vendor: "fireworks", label: "b", granted: 300 }),
                grant({
                    vendor: "ovhcloud",
                    granted: 1000,
                    currency: "EUR",
                    start_date: "2026-03-09",
                }),
                opCreditBurn({
                    month: "2026-04",
                    vendor: "fireworks",
                    credit: 80,
                }),
                opCreditBurn({
                    month: "2026-05",
                    vendor: "fireworks",
                    credit: 20,
                }),
            ],
        });
        const rows = creditRunway(data, NOW);
        const fireworks = rows.find((row) => row.vendor === "fireworks");
        const ovh = rows.find((row) => row.vendor === "ovhcloud");
        if (!fireworks || !ovh) throw new Error("rows missing");

        expect(fireworks.grantedUsd).toBe(1000);
        expect(fireworks.grants).toHaveLength(2);
        expect(fireworks.burnedUsd).toBe(100);
        expect(fireworks.remainingUsd).toBe(900);
        expect(ovh.grantedUsd).toBeCloseTo(1155.8, 5); // 1000 × 1.1558 (Mar)
    });

    it("nets a vendor's grant pool against its OP Cloud burn rows", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", granted: 1000 }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "lambda",
                    credit: 100,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.burnedUsd).toBe(100);
        expect(row.remainingUsd).toBe(900);
    });

    it("keeps OpenAI grant-funded usage in the main runway table", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "openai",
                    label: "credit grant",
                    granted: 1565.58,
                    start_date: "2026-01-01",
                    expires: "2026-08-01",
                }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "openai",
                    credit: 531.25,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.vendor).toBe("openai");
        expect(row.grantedUsd).toBe(1565.58);
        expect(row.burnedUsd).toBe(531.25);
        expect(row.remainingUsd).toBeCloseTo(1034.33, 2);
    });

    it("tracks pre-2026 opening burn on the main runway row", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "google",
                    granted: 100000,
                    start_date: "2026-01-01",
                }),
                opCreditBurn({
                    month: "2025-01",
                    vendor: "google",
                    credit: 63899.8,
                    resource_name: "pre-2026 grant burn",
                    evidence: "pre-2026 opening grant burn",
                }),
            ],
        });
        const [runway] = creditRunway(data, NOW);
        expect(runway.preWindowBurnUsd).toBe(63899.8);
        expect(runway.burnedUsd).toBe(63899.8);
        expect(runway.remainingUsd).toBeCloseTo(36100.2, 2);
    });

    it("projects depletion from last full-month base and current-month intensity", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", granted: 1000 }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "lambda",
                    credit: 100,
                }),
                opCreditBurn({
                    month: "2026-07",
                    vendor: "lambda",
                    credit: 80,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.currentMonthBurnUsd).toBe(80);
        expect(row.lastMonthBurnUsd).toBe(100);
        // June close had $900 left. July consumed $80 so far, leaving $820
        // at $10/day from the current-month intensity.
        expect(row.remainingUsd).toBe(820);
        expect(row.rateBasis).toBe("current");
        expect(row.monthlyRateUsd).toBeCloseTo((80 / 8) * 30.44, 5);
        expect(row.depletionDate).toBe("2026-09-28");
        expect(row.depletionReason).toBe("burn");
    });

    it("falls back to the latest witnessed month when recent months lag, flagged stale", () => {
        // aws shape: Automat-it deducts credits at invoice time (~the 10th of
        // the next month), so June/July read zero until the invoice lands.
        const data = emptyData({
            opCloud: [
                grant({ vendor: "aws", granted: 10000 }),
                opCreditBurn({
                    month: "2026-05",
                    vendor: "aws",
                    credit: 3000,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.rateBasis).toBe("stale");
        expect(row.monthlyRateUsd).toBe(3000);
        expect(row.flags).toContain("no burn data since May 26");
        expect(row.depletionDate).not.toBeNull();
    });

    it("falls back to the last complete month when the running month is silent", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", granted: 1000 }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "lambda",
                    credit: 50,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.rateBasis).toBe("last");
        expect(row.monthlyRateUsd).toBe(50);
        const dormant = creditRunway(
            emptyData({ opCloud: [grant({ vendor: "lambda", granted: 10 })] }),
            NOW,
        );
        expect(dormant[0].monthlyRateUsd).toBeNull();
        expect(dormant[0].depletionDate).toBeNull();
    });

    it("lets an upcoming expiry beat a later burn date", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "digitalocean",
                    granted: 1000,
                    expires: "2026-07-22",
                }),
                opCreditBurn({
                    month: "2026-07",
                    vendor: "digitalocean",
                    credit: 80,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.depletionDate).toBe("2026-07-22");
        expect(row.depletionReason).toBe("expiry");
    });

    it("keeps the pool alive past an early expiry while later grants hold capacity", () => {
        // One grant lapses on Jul 22, but a second, unexpiring grant keeps
        // the vendor funded — Runs Out must reflect burning through it, not
        // the first expiry.
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "digitalocean",
                    label: "expiring",
                    granted: 1000,
                    expires: "2026-07-22",
                }),
                grant({
                    vendor: "digitalocean",
                    label: "evergreen",
                    granted: 380,
                }),
                opCreditBurn({
                    month: "2026-07",
                    vendor: "digitalocean",
                    credit: 80,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        // rate: 80 over 8 days = 304.37/month = 10/day. July's burn fills
        // the evergreen grant first (label order), leaving it 300. The
        // expiring parcel lapses Jul 22; 300 more burn 30 days past that.
        expect(row.depletionReason).toBe("burn");
        expect(row.depletionDate).toBe("2026-08-21");
    });

    it("flags pre-window grants, lapsed remainders, and unallocated burn", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "google",
                    granted: 100,
                    start_date: "2025-01-01",
                }),
                grant({
                    vendor: "scaleway",
                    label: "old",
                    granted: 100,
                    expires: "2026-01-31",
                }),
                grant({ vendor: "elevenlabs", granted: 100 }),
                grant({ vendor: "runpod", granted: 100 }),
                opCreditBurn({
                    month: "2026-04",
                    vendor: "elevenlabs",
                    credit: 120,
                }),
                opCreditBurn({
                    month: "2026-04",
                    vendor: "runpod",
                    credit: 100,
                }),
            ],
        });
        const byVendor = new Map(
            creditRunway(data, NOW).map((row) => [row.vendor, row]),
        );
        expect(byVendor.get("google")?.flags).toContain(
            "pre-window burn unwitnessed",
        );
        // unused capacity of the expired grant lapses to zero remaining
        expect(byVendor.get("scaleway")?.flags).toContain("lapsed 100");
        expect(byVendor.get("scaleway")?.remainingUsd).toBe(0);
        expect(byVendor.get("scaleway")?.finished).toBe(true);
        expect(byVendor.get("scaleway")?.finishedDate).toBe("2026-01-31");
        // burn beyond every grant's capacity is unallocated, not negative
        expect(byVendor.get("elevenlabs")?.flags).toContain(
            "unallocated burn 20",
        );
        expect(byVendor.get("elevenlabs")?.remainingUsd).toBe(0);
        expect(byVendor.get("elevenlabs")?.finished).toBe(true);
        // exactly consumed pool: finished with its fill month
        expect(byVendor.get("runpod")?.finished).toBe(true);
        expect(byVendor.get("runpod")?.finishedDate).toBe("2026-04");
        expect(byVendor.get("runpod")?.flags).toEqual([]);
    });

    it("never lets in-window burn consume a grant that started later", () => {
        // January burn cannot draw down an April grant — the leftover is
        // surfaced as unallocated instead of understating remaining credit.
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "aws",
                    label: "early",
                    granted: 100,
                    start_date: "2025-11-01",
                    expires: "2026-02-28",
                }),
                grant({
                    vendor: "aws",
                    label: "late",
                    granted: 200,
                    start_date: "2026-04-01",
                }),
                opCreditBurn({
                    month: "2026-01",
                    vendor: "aws",
                    credit: 130,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        const early = row.grants.find((g) => g.label === "early");
        const late = row.grants.find((g) => g.label === "late");
        expect(early?.allocatedUsd).toBe(100); // window-respecting fill
        expect(late?.allocatedUsd).toBe(0); // April grant untouched
        expect(row.remainingUsd).toBe(200);
        expect(row.flags).toContain("unallocated burn 30");
    });

    it("lets the pre-2026 opening plug spill onto later-started grants", () => {
        // google shape: the explicit "pre-2026 grant burn" plug predates the
        // grant rows' start metadata but verifiably drew from those pools.
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "google",
                    granted: 100000,
                    start_date: "2026-01-01",
                }),
                opCreditBurn({
                    month: "2025-01",
                    vendor: "google",
                    credit: 63899.8,
                    resource_name: "pre-2026 grant burn",
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.remainingUsd).toBeCloseTo(36100.2, 2);
        expect(row.flags).not.toContain("unallocated burn 63899.8");
    });

    it("keeps ordinary pre-window burn off grants that started later", () => {
        // only the synthetic opening plug gets the metadata exemption; a
        // regular 2025 burn row cannot consume a 2026 grant.
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "google",
                    granted: 100000,
                    start_date: "2026-01-01",
                }),
                opCreditBurn({
                    month: "2025-01",
                    vendor: "google",
                    credit: 500,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.remainingUsd).toBe(100000);
        expect(row.flags).toContain("unallocated burn 500");
    });

    it("reports grant statuses from positive OP Cloud credit rows", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", label: "live", granted: 100 }),
                grant({
                    vendor: "runpod",
                    label: "done",
                    granted: 50,
                }),
                grant({
                    vendor: "scaleway",
                    label: "old",
                    granted: 100,
                    expires: "2026-01-31",
                }),
                opCreditBurn({
                    month: "2026-04",
                    vendor: "runpod",
                    credit: 50,
                }),
            ],
        });
        const { grants } = allocateGrants(data, NOW);
        const byKey = new Map(grants.map((g) => [`${g.vendor}|${g.label}`, g]));
        expect(byKey.get("lambda|live")?.active).toBe(true);
        expect(byKey.get("runpod|done")?.active).toBe(false);
        expect(byKey.get("runpod|done")?.finishedDate).toBe("2026-04");
        expect(byKey.get("scaleway|old")?.active).toBe(false);
        expect(byKey.get("scaleway|old")?.lapsedUsd).toBe(100);
    });

    it("includes pre-window burn rows in the runway math", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "aws",
                    granted: 100000,
                    start_date: "2025-09-01",
                }),
                opCreditBurn({
                    month: "2025-12",
                    vendor: "aws",
                    credit: 35000,
                }),
                opCreditBurn({
                    month: "2026-01",
                    vendor: "aws",
                    credit: 45000,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.burnedUsd).toBe(80000);
        expect(row.remainingUsd).toBe(20000);
    });

    it("sorts soonest depletion first", () => {
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", granted: 100 }),
                grant({
                    vendor: "digitalocean",
                    granted: 1000,
                    expires: "2026-07-22",
                }),
                grant({ vendor: "fireworks", granted: 50 }), // dormant, no depletion
                opCreditBurn({
                    month: "2026-07",
                    vendor: "lambda",
                    credit: 90,
                }),
                opCreditBurn({
                    month: "2026-07",
                    vendor: "digitalocean",
                    credit: 10,
                }),
            ],
        });
        const rows = creditRunway(data, NOW);
        expect(rows.map((row) => row.vendor)).toEqual([
            "lambda", // remaining 10 at $11.25/day → ~Jul 9
            "digitalocean", // expiry Jul 22
            "fireworks", // no depletion → last
        ]);
    });

    it("features a pollen-priced gift pool as finished credits (pointsflyer)", () => {
        const data = emptyData({
            opCloud: [
                grant({
                    vendor: "pointsflyer",
                    label: "gifted compute",
                    granted: 100,
                    start_date: "2025-12-01",
                    expires: "2026-04-30",
                }),
                opCreditBurn({
                    month: "2026-01",
                    vendor: "pointsflyer",
                    credit: 60,
                }),
                opCreditBurn({
                    month: "2026-02",
                    vendor: "pointsflyer",
                    credit: 40,
                }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.vendor).toBe("pointsflyer");
        expect(row.burnedUsd).toBe(100);
        expect(row.remainingUsd).toBe(0);
        expect(row.finished).toBe(true);
    });
});

describe("providerBalanceRows", () => {
    const NOW = new Date("2026-03-15T12:00:00Z");
    const rowFor = (data: Data, now: Date, vendor: string) => {
        const row = providerBalanceRows(data, now).find(
            (candidate) => candidate.vendor === vendor,
        );
        if (!row) throw new Error(`missing ${vendor} balance row`);
        return row;
    };

    it("shows ledger flows without inventing an unchecked balance", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    entry_id: "vast-opening",
                    date: "2025-12-10",
                    vendor: "vast.ai",
                    amount: -100,
                }),
                opTxn({
                    entry_id: "vast-january-topup",
                    date: "2026-01-10",
                    vendor: "vast.ai",
                    amount: -400,
                }),
            ],
            opCloud: [
                grant({
                    vendor: "vast.ai",
                    granted: 1000,
                    start_date: "2026-01-01",
                }),
                opCreditBurn({
                    month: "2026-01",
                    vendor: "vast.ai",
                    paid: 200,
                    credit: 100,
                }),
                opCreditBurn({
                    month: "2026-02",
                    vendor: "vast.ai",
                    paid: 50,
                    credit: 200,
                }),
            ],
        });

        const row = rowFor(data, NOW, "vast.ai");
        expect(row.vendor).toBe("vast.ai");
        expect(row.cashBalanceUsd).toBeNull();
        expect(row.creditBalanceUsd).toBeNull();
        expect(row.balanceStatus).toBe("not_checked");
        expect(row.finished).toBe(false);

        const january = row.history.find((month) => month.month === "2026-01");
        const february = row.history.find((month) => month.month === "2026-02");
        expect(january).toMatchObject({
            cashOpeningUsd: null,
            cashAddedUsd: 400,
            cashUsedUsd: 200,
            cashClosingUsd: null,
            creditOpeningUsd: null,
            creditAddedUsd: 1000,
            creditUsedUsd: 100,
            creditClosingUsd: null,
        });
        expect(february).toMatchObject({
            cashOpeningUsd: null,
            cashUsedUsd: 50,
            cashClosingUsd: null,
            creditOpeningUsd: null,
            creditUsedUsd: 200,
            creditClosingUsd: null,
        });
    });

    it("does not invent a prepaid balance for an ordinary billed provider", () => {
        const data = emptyData({
            opTransactions: [opTxn({ vendor: "aws", amount: -500 })],
            opCloud: [
                grant({ vendor: "aws", granted: 1000 }),
                opCreditBurn({ vendor: "aws", credit: 100 }),
            ],
        });
        const row = rowFor(data, NOW, "aws");

        expect(row.vendor).toBe("aws");
        expect(row.cashBalanceUsd).toBeNull();
        expect(row.creditBalanceUsd).toBeNull();
    });

    it("keeps an unchecked prepaid pool active for attention", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    entry_id: "vast-topup",
                    date: "2026-01-01",
                    vendor: "vast.ai",
                    amount: -100,
                }),
            ],
            opCloud: [
                opCloud({
                    entry_id: "vast-usage",
                    start: "2026-01-02 00:00:00",
                    vendor: "vast.ai",
                    type: "gpu",
                    paid: -150,
                }),
            ],
        });
        const row = rowFor(data, NOW, "vast.ai");

        expect(row.cashBalanceUsd).toBeNull();
        expect(row.finished).toBe(false);
    });

    it("anchors the current roll-forward to an OP Cloud balance snapshot", () => {
        const now = new Date("2026-08-22T12:00:00Z");
        const data = emptyData({
            opTransactions: [
                opTxn({
                    entry_id: "vast-topup",
                    date: "2026-07-01",
                    vendor: "vast.ai",
                    amount: -500,
                }),
            ],
            opCloud: [
                opCloud({
                    entry_id: "vast-usage",
                    vendor: "vast.ai",
                    type: "gpu",
                    start: "2026-07-01 00:00:00",
                    paid: -200,
                }),
                opCloud({
                    entry_id: "vast-balance-2026-08-22",
                    source: "dashboard",
                    vendor: "vast.ai",
                    type: "balance",
                    start: "2026-08-22 10:00:00",
                    end: "2027-01-01 00:00:00",
                    paid: 3_925.11,
                    credit: 8.95,
                    resource_sku: "current-balance",
                }),
            ],
        });
        const row = rowFor(data, now, "vast.ai");

        expect(row).toMatchObject({
            vendor: "vast.ai",
            cashBalanceUsd: 3_925.11,
            creditBalanceUsd: 8.95,
            balanceAsOf: "2026-08-22",
            balanceStatus: "checked",
            balanceNote: null,
        });
        expect(row.history.at(-1)).toMatchObject({
            month: "2026-08",
            cashClosingUsd: 3_925.11,
            creditClosingUsd: 8.95,
        });
        expect(
            creditRunway(
                emptyData({
                    opCloud: [
                        opCloud({
                            vendor: "vast.ai",
                            type: "balance",
                            start: "2026-08-22 10:00:00",
                            paid: 3_925.11,
                            credit: 8.95,
                        }),
                    ],
                }),
                now,
            ),
        ).toEqual([]);
    });

    it("recognizes the external InferencePort wallet snapshot", () => {
        const now = new Date("2026-08-25T12:00:00Z");
        const data = emptyData({
            opCloud: [
                opCloud({
                    entry_id: "inferenceport-balance-2026-08-25",
                    vendor: "inferenceport",
                    type: "balance",
                    start: "2026-08-25 10:21:59",
                    paid: 29.4185,
                    credit: 0,
                    resource_sku: "current-balance",
                }),
            ],
        });
        const row = rowFor(data, now, "inferenceport");

        expect(row).toMatchObject({
            vendor: "inferenceport",
            cashBalanceUsd: 29.4185,
            creditBalanceUsd: 0,
            balanceAsOf: "2026-08-25",
            balanceStatus: "checked",
        });
    });

    it("does not roll post-snapshot flows backward through the anchor", () => {
        const now = new Date("2026-08-24T12:00:00Z");
        const data = emptyData({
            opTransactions: [
                opTxn({
                    entry_id: "vast-before",
                    date: "2026-08-20",
                    vendor: "vast.ai",
                    amount: -100,
                }),
                opTxn({
                    entry_id: "vast-after",
                    date: "2026-08-23",
                    vendor: "vast.ai",
                    amount: -500,
                }),
            ],
            opCloud: [
                opCloud({
                    entry_id: "vast-before-usage",
                    vendor: "vast.ai",
                    type: "gpu",
                    start: "2026-08-21 00:00:00",
                    paid: -20,
                }),
                opCloud({
                    entry_id: "vast-after-usage",
                    vendor: "vast.ai",
                    type: "gpu",
                    start: "2026-08-23 00:00:00",
                    paid: -50,
                }),
                opCloud({
                    entry_id: "vast-balance",
                    source: "dashboard",
                    vendor: "vast.ai",
                    type: "balance",
                    start: "2026-08-22 10:00:00",
                    paid: 400,
                    resource_sku: "current-balance",
                }),
            ],
        });
        const row = rowFor(data, now, "vast.ai");
        const august = row.history.find((month) => month.month === "2026-08");

        expect(row.cashBalanceUsd).toBe(400);
        expect(august).toMatchObject({
            cashAddedUsd: 100,
            cashUsedUsd: 20,
            cashClosingUsd: 400,
            cashOpeningUsd: 320,
        });
    });

    it("requires every active account before anchoring a multi-account vendor", () => {
        const now = new Date("2026-08-22T12:00:00Z");
        const base = emptyData({
            opCloud: [
                grant({
                    vendor: "openrouter",
                    granted: 6_000,
                    start_date: "2026-05-01",
                }),
                opCloud({
                    entry_id: "openrouter-myceli-balance",
                    source: "dashboard",
                    vendor: "openrouter",
                    account_id: "myceli",
                    type: "balance",
                    start: "2026-08-22 10:00:00",
                    paid: 0,
                    credit: 16.17,
                    resource_sku: "current-balance",
                }),
            ],
        });

        expect(rowFor(base, now, "openrouter")).toMatchObject({
            creditBalanceUsd: 16.17,
            balanceAsOf: "2026-08-22",
            balanceStatus: "partial",
            checkedAccounts: 1,
            expectedAccounts: 2,
            creditDepletionDate: null,
        });

        base.opCloud?.push(
            opCloud({
                entry_id: "openrouter-pollinations-balance",
                source: "dashboard",
                vendor: "openrouter",
                account_id: "pollinations",
                type: "balance",
                start: "2026-08-22 11:00:00",
                paid: 0,
                credit: 1_500,
                resource_sku: "current-balance",
            }),
        );
        expect(rowFor(base, now, "openrouter")).toMatchObject({
            creditBalanceUsd: 1_516.17,
            balanceAsOf: "2026-08-22",
            balanceStatus: "checked",
            checkedAccounts: 2,
            expectedAccounts: 2,
        });
    });

    it("combines fresh multi-account snapshots checked on adjacent days", () => {
        const now = new Date("2026-08-23T12:00:00Z");
        const rows = providerBalanceRows(
            emptyData({
                opCloud: [
                    opCloud({
                        vendor: "openrouter",
                        account_id: "myceli",
                        type: "balance",
                        start: "2026-08-22 10:00:00",
                        credit: 16.17,
                    }),
                    opCloud({
                        vendor: "openrouter",
                        account_id: "pollinations",
                        type: "balance",
                        start: "2026-08-23 10:00:00",
                        credit: 1_500,
                    }),
                ],
            }),
            now,
        );

        expect(rows.find((row) => row.vendor === "openrouter")).toMatchObject({
            creditBalanceUsd: 1_516.17,
            balanceAsOf: "2026-08-22",
            balanceStatus: "checked",
            checkedAccounts: 2,
            expectedAccounts: 2,
        });
    });

    it("does not call stale balance snapshots checked", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    vendor: "vast.ai",
                    type: "balance",
                    start: "2026-08-01 10:00:00",
                    paid: 500,
                }),
            ],
        });
        const row = rowFor(data, new Date("2026-08-23T12:00:00Z"), "vast.ai");

        expect(row).toMatchObject({
            balanceAsOf: "2026-08-01",
            balanceStatus: "stale",
            cashBalanceUsd: 500,
        });
    });

    it("lists a provider even when it has no wallet balance to refresh", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    vendor: "inception",
                    type: "inference",
                    paid: -10,
                }),
            ],
        });

        expect(
            rowFor(data, new Date("2026-08-22T12:00:00Z"), "inception"),
        ).toMatchObject({
            active: true,
            balanceTracking: false,
            balanceStatus: "not_applicable",
            cashBalanceUsd: null,
            creditBalanceUsd: null,
        });
    });

    it("keeps inactive providers and their last known balance in history", () => {
        const now = new Date("2026-08-25T12:00:00Z");
        const row = rowFor(
            emptyData({
                opCloud: [
                    opCloud({
                        vendor: "io.net",
                        type: "balance",
                        start: "2026-07-01 00:00:00",
                        credit: 324.86,
                    }),
                ],
            }),
            now,
            "io.net",
        );

        expect(row).toMatchObject({
            active: false,
            balanceTracking: true,
            balanceStatus: "archived",
            balanceAsOf: "2026-07-01",
            creditBalanceUsd: 324.86,
        });
    });
});
