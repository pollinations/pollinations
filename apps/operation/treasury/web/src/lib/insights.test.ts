import { describe, expect, it } from "vitest";
import type {
    Data,
    OpCloudRow,
    OpPollenRow,
    OpTransactionRow,
    PollenMonthlyRow,
    ProviderMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import {
    allocateGrants,
    breakEvenMultiplier,
    CATEGORY_ORDER,
    categoryColumns,
    creditRunway,
    economics,
    ecosystemTotals,
    globalNetRatio,
    insightVendorOptions,
    modelEconomics,
    monthlyRevenue,
    monthSpendDetail,
    pnlByMonth,
    pnlStatement,
    providerEconomics,
    transactionCashUsd,
    ungrantedCreditBurn,
    vendorPlanes,
} from "./insights";

const revenueRow = (
    month: string,
    gross: number,
    fees: number,
    refunds = 0,
): RevenueMonthlyRow => ({
    source: "stripe",
    month,
    currency: "EUR",
    gross_amount: gross,
    fees_amount: fees,
    refunds_amount: refunds,
});

describe("monthlyRevenue", () => {
    it("converts EUR to USD and computes net per month, sorted ascending", () => {
        const rows = [
            revenueRow("2026-06", 1000, 90, 10),
            revenueRow("2026-05", 500, 45),
        ];
        const result = monthlyRevenue(rows);

        expect(result.map((entry) => entry.month)).toEqual([
            "2026-05",
            "2026-06",
        ]);
        // 2026-06: gross 1000 EUR × 1.1518, net (1000-90-10) × 1.1518
        expect(result[1].grossUsd).toBeCloseTo(1151.8, 1);
        expect(result[1].netUsd).toBeCloseTo(1036.62, 1);
        expect(result[1].netRatio).toBeCloseTo(0.9, 4);
    });

    it("reports a null ratio when gross is zero", () => {
        expect(
            monthlyRevenue([revenueRow("2026-06", 0, 0)])[0].netRatio,
        ).toBeNull();
    });
});

describe("globalNetRatio", () => {
    it("volume-blends across months", () => {
        const rows = [
            revenueRow("2026-05", 500, 100),
            revenueRow("2026-06", 1500, 100),
        ];
        const gross = 500 * 1.1673 + 1500 * 1.1518;
        const net = 400 * 1.1673 + 1400 * 1.1518;
        expect(globalNetRatio(rows)).toBeCloseTo(net / gross, 6);
    });

    it("is null with no revenue", () => {
        expect(globalNetRatio([])).toBeNull();
    });
});

describe("breakEvenMultiplier", () => {
    it("is the reciprocal of the net ratio", () => {
        expect(breakEvenMultiplier(0.91)).toBeCloseTo(1.0989, 4);
    });

    it("is null for null or zero ratios", () => {
        expect(breakEvenMultiplier(null)).toBeNull();
        expect(breakEvenMultiplier(0)).toBeNull();
    });
});

const txn = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-05-10",
    vendor: "aws",
    category: "compute",
    charged_amount: 0,
    charged_currency: "",
    ...over,
});

const opTxn = (over: Partial<OpTransactionRow>): OpTransactionRow => ({
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

const provider = (over: Partial<ProviderMonthlyRow>): ProviderMonthlyRow => ({
    month: "2026-05",
    vendor: "aws",
    currency: "USD",
    credit: 0,
    paid: 0,
    source: "api",
    ...over,
});

const emptyData = (over: Partial<Data>): Data => ({
    transactions: [],
    providerMonthly: [],
    pollenMonthly: [],
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    grants: [],
    runs: [],
    revenueMonthly: [],
    gpuRuns: [],
    ...over,
});

const usage = (over: Partial<PollenMonthlyRow>): PollenMonthlyRow => ({
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
    requests: 0,
    ...over,
});

describe("transactionCashUsd", () => {
    it("converts the settled EUR leg by the row month", () => {
        const row = txn({ charged_amount: 100, charged_currency: "EUR" });
        expect(transactionCashUsd(row)).toBeCloseTo(116.73, 2);
    });

    it("passes USD through 1:1", () => {
        const row = txn({ charged_amount: 42, charged_currency: "USD" });
        expect(transactionCashUsd(row)).toBe(42);
    });

    it("is zero for a zero amount", () => {
        expect(transactionCashUsd(txn({}))).toBe(0);
    });
});

describe("pnlByMonth", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("blends revenue and category spend per month from op_transactions only", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-05-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 1820,
                    currency: "EUR",
                }),
                opTxn({
                    date: "2026-05-10",
                    category: "cloud",
                    amount: -1000,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-05-25",
                    category: "payroll",
                    amount: -100,
                    currency: "EUR",
                }),
                opTxn({
                    date: "2026-06-01",
                    category: "cloud",
                    amount: -50,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-07-02",
                    category: "cloud",
                    amount: -10,
                    currency: "USD",
                }),
            ],
            transactions: [
                txn({
                    date: "2026-05-10",
                    category: "compute",
                    charged_amount: 99999,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [provider({ month: "2026-05", credit: 99999 })],
            revenueMonthly: [revenueRow("2026-05", 99999, 0)],
        });
        const [may, june, july] = pnlByMonth(data, now);

        expect(may.month).toBe("2026-05");
        expect(may.categories.cloud).toBe(1000);
        expect(may.categories.payroll).toBeCloseTo(116.73, 2);
        expect(may.spendUsd).toBeCloseTo(1116.73, 2);
        expect(may.revenueNetUsd).toBeCloseTo(1820 * 1.1673, 1);
        expect(may.cashPnlUsd).toBeCloseTo(1820 * 1.1673 - 1116.73, 1);
        expect(may.monthInProgress).toBe(false);

        // Wise cash is real time: a closed month is complete even before
        // any later rows exist; only the current calendar month is flagged.
        expect(june.monthInProgress).toBe(false);
        expect(june.spendUsd).toBe(50);
        expect(june.revenueNetUsd).toBeNull();
        expect(june.cashPnlUsd).toBeNull();

        expect(july.month).toBe("2026-07");
        expect(july.monthInProgress).toBe(true);
        expect(july.spendUsd).toBe(10);
    });

    it("reports null spend for a month with no transactions at all", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-04-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 10,
                }),
            ],
        });
        const [april] = pnlByMonth(data, now);
        expect(april.month).toBe("2026-04");
        expect(april.spendUsd).toBeNull();
        expect(april.cashPnlUsd).toBeNull();
    });

    it("ignores pre-window transaction rows entirely", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2025-12-31",
                    vendor: "aws",
                    category: "cloud",
                    amount: -35000,
                }),
                opTxn({
                    date: "2026-04-01",
                    vendor: "aws",
                    category: "cloud",
                    amount: -10,
                }),
            ],
        });
        expect(pnlByMonth(data, now).map((row) => row.month)).toEqual([
            "2026-04",
        ]);
    });
});

describe("monthSpendDetail", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("groups the month's cash by category and vendor with shares", () => {
        const data = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-05-10",
                    vendor: "aws",
                    category: "cloud",
                    amount: -300,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-05-12",
                    vendor: "aws",
                    category: "cloud",
                    amount: -100,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-05-25",
                    vendor: "deel",
                    category: "payroll",
                    amount: -100,
                    currency: "USD",
                }),
                opTxn({
                    date: "2026-04-01",
                    vendor: "aws",
                    category: "cloud",
                    amount: -999,
                    currency: "USD",
                }),
            ],
        });
        const detail = monthSpendDetail(data, "2026-05", now);

        expect(detail.spend).toEqual([
            {
                category: "cloud",
                vendor: "aws",
                cashUsd: 400,
                pctOfSpend: 80,
            },
            {
                category: "payroll",
                vendor: "deel",
                cashUsd: 100,
                pctOfSpend: 20,
            },
        ]);
        expect(detail.summary?.month).toBe("2026-05");
    });

    it("returns empty structures for a month with no data", () => {
        const detail = monthSpendDetail(emptyData({}), "2026-05", now);
        expect(detail.spend).toEqual([]);
        expect(detail.summary).toBeNull();
    });
});

describe("categoryColumns", () => {
    it("keeps the fixed order and appends unknown categories sorted", () => {
        const months = pnlByMonth(
            emptyData({
                opTransactions: [
                    opTxn({
                        date: "2026-05-01",
                        category: "zulu",
                        amount: -1,
                        currency: "USD",
                    }),
                    opTxn({
                        date: "2026-05-02",
                        category: "cloud",
                        amount: -1,
                        currency: "USD",
                    }),
                ],
            }),
            new Date("2026-07-06T12:00:00Z"),
        );
        expect(categoryColumns(months)).toEqual([...CATEGORY_ORDER, "zulu"]);
    });
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
                    vendor: "google",
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
            transactions: [
                txn({
                    date: "2026-06-13",
                    vendor: "google",
                    category: "compute",
                    charged_amount: 99999,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "google", paid: 99999 }),
            ],
            pollenMonthly: [usage({ vendor: "google", cost_paid: 99999 })],
        });
        const [row] = vendorPlanes(data);

        expect(row.month).toBe("2026-06");
        expect(row.vendor).toBe("google");
        expect(row.cashUsd).toBe(5000); // SaaS row excluded - cloud only
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

    it("keeps infra cloud burn out of the product-meter witness", () => {
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
        const [row] = vendorPlanes(data);
        expect(row.vendor).toBe("cloudflare");
        expect(row.cloudPaidUsd).toBe(1073);
        expect(row.cloudUsd).toBe(1073);
        expect(row.meterCloudUsd).toBeNull();
        expect(row.cashCoverage).toBe("same month");
        expect(row.meterCoverage).toBeNull();
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

    it("treats cash-only tooling vendors as neutral data-quality rows", () => {
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
        const [row] = vendorPlanes(data);
        expect(row.cashUsd).toBe(225.25);
        expect(row.cloudUsd).toBeNull();
        expect(row.pollenCostUsd).toBeNull();
        expect(row.cashCoverage).toBeNull();
        expect(row.meterCoverage).toBeNull();
        expect(row.status).toBe("cash only");
    });

    it("flags cash-only rows for vendors that normally have product cloud meters", () => {
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
        const row = vendorPlanes(data).find(
            (entry) => entry.month === "2026-06",
        );
        expect(row?.meterCoverage).toBe("missing cloud");
        expect(row?.status).toBe("missing cloud");
    });
});

describe("insightVendorOptions", () => {
    it("unions vendors across OP planes only, cloud transactions only", () => {
        const data = emptyData({
            transactions: [
                txn({ vendor: "aws", category: "compute" }),
                txn({ vendor: "deel", category: "payroll" }),
            ],
            providerMonthly: [provider({ vendor: "ovhcloud" })],
            pollenMonthly: [usage({ vendor: "google" })],
            opTransactions: [
                opTxn({ vendor: "runpod", category: "cloud" }),
                opTxn({ vendor: "figma", category: "saas" }),
            ],
            opCloud: [opCloud({ vendor: "replicate" })],
            opPollen: [opPollen({ vendor: "azure" })],
        });
        expect(insightVendorOptions(data)).toEqual([
            "all",
            "azure",
            "replicate",
            "runpod",
        ]);
    });
});

describe("economics", () => {
    // google: metered 1000 (800 + 200), actual 5000 (1000 credit + 4000 paid)
    // → calib 5.00, credit share 20%. azure: pollen active, no provider rows.
    const data = emptyData({
        providerMonthly: [
            provider({
                month: "2026-06",
                vendor: "google",
                currency: "USD",
                credit: 1000,
                paid: 4000,
            }),
        ],
        pollenMonthly: [
            usage({
                vendor: "google",
                model: "gemini-a",
                cost_paid: 600,
                cost_quests: 200,
                price_paid: 900,
                price_quests: 250,
                byop_paid: 50,
                model_paid: 100,
                byop_quests: 5,
            }),
            usage({
                vendor: "google",
                model: "gemini-b",
                cost_paid: 100,
                cost_quests: 100,
                price_paid: 100,
                price_quests: 90,
            }),
            usage({
                vendor: "azure",
                model: "gpt-x",
                cost_paid: 50,
                cost_quests: 50,
                price_paid: 40,
                price_quests: 45,
            }),
        ],
    });

    it("ignores infra provider rows when computing calib", () => {
        const withInfra = emptyData({
            providerMonthly: [
                ...data.providerMonthly,
                provider({
                    month: "2026-06",
                    vendor: "google",
                    category: "infra",
                    paid: 9999,
                }),
            ],
            pollenMonthly: data.pollenMonthly,
        });
        const rows = economics(withInfra, "2026-06", "model");
        const geminiA = rows.find((row) => row.model === "gemini-a");
        expect(geminiA?.calib).toBeCloseTo(5, 5); // unchanged by the infra row
    });

    it("computes calib as a raw scope division and applies it per model", () => {
        const rows = economics(data, "2026-06", "model");
        const geminiA = rows.find((row) => row.model === "gemini-a");
        if (!geminiA) throw new Error("gemini-a missing");

        expect(geminiA.calib).toBeCloseTo(5, 5); // 5000 actual / 1000 metered
        expect(geminiA.creditSharePct).toBeCloseTo(20, 5);
        expect(geminiA.trueCostPaidUsd).toBeCloseTo(3000, 5); // 600 × 5
        expect(geminiA.questBurnUsd).toBeCloseTo(1000, 5); // 200 × 5
        expect(geminiA.soldPaidUsd).toBe(900);
        expect(geminiA.ecoPaidUsd).toBe(150); // 50 byop + 100 model, paid side
        expect(geminiA.retainedPaidUsd).toBe(750);
        expect(geminiA.soldQuestsUsd).toBe(250);
        expect(geminiA.trueMultiplier).toBeCloseTo(750 / 3000, 5);
        expect(geminiA.marginUsd).toBeCloseTo(750 - 3000, 5);
        expect(geminiA.pollenPriced).toBe(false);
        expect(geminiA.flags).toEqual([]);
    });

    it("flags a vendor with no meter and falls back to our metering", () => {
        const rows = economics(data, "2026-06", "model");
        const azure = rows.find((row) => row.vendor === "azure");
        if (!azure) throw new Error("azure missing");

        expect(azure.calib).toBeNull();
        expect(azure.flags).toEqual(["no meter"]);
        expect(azure.trueCostPaidUsd).toBeCloseTo(50, 5); // metering unadjusted
        expect(azure.trueMultiplier).toBeCloseTo(0.8, 5); // 40 / 50
        expect(azure.creditSharePct).toBeNull();
    });

    it("rolls the vendor grain up to exactly the sum of its model rows", () => {
        const models = economics(data, "2026-06", "model").filter(
            (row) => row.vendor === "google",
        );
        const vendorRow = economics(data, "2026-06", "vendor").find(
            (row) => row.vendor === "google",
        );
        if (!vendorRow) throw new Error("google vendor row missing");

        const sum = (pick: (row: (typeof models)[number]) => number) =>
            models.reduce((total, row) => total + pick(row), 0);
        expect(vendorRow.model).toBeNull();
        expect(vendorRow.soldPaidUsd).toBeCloseTo(
            sum((row) => row.soldPaidUsd),
            5,
        );
        expect(vendorRow.trueCostPaidUsd).toBeCloseTo(
            sum((row) => row.trueCostPaidUsd),
            5,
        );
        expect(vendorRow.questBurnUsd).toBeCloseTo(
            sum((row) => row.questBurnUsd),
            5,
        );
        expect(vendorRow.marginUsd).toBeCloseTo(
            sum((row) => row.marginUsd),
            5,
        );
        expect(vendorRow.trueMultiplier).toBeCloseTo(
            sum((row) => row.retainedPaidUsd) /
                sum((row) => row.trueCostPaidUsd),
            5,
        );
    });

    it("flags unwitnessed months instead of pairing them away", () => {
        const lagged = emptyData({
            providerMonthly: [
                provider({
                    month: "2026-06",
                    vendor: "google",
                    currency: "USD",
                    paid: 500,
                }),
            ],
            pollenMonthly: [
                usage({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 250,
                    price_paid: 300,
                }),
                usage({
                    month: "2026-07",
                    vendor: "google",
                    cost_paid: 250,
                    price_paid: 300,
                }),
            ],
        });
        const [row] = economics(lagged, "", "vendor");
        // Naive division over the whole scope: 500 / (250 + 250).
        expect(row.calib).toBeCloseTo(1, 5);
        expect(row.flags).toEqual(["unwitnessed July 26"]);
    });

    it("flags provider months with no pollen as unmetered", () => {
        const ghost = emptyData({
            providerMonthly: [
                provider({
                    month: "2026-05",
                    vendor: "google",
                    currency: "USD",
                    paid: 100,
                }),
                provider({
                    month: "2026-06",
                    vendor: "google",
                    currency: "USD",
                    paid: 100,
                }),
            ],
            pollenMonthly: [
                usage({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 100,
                    price_paid: 120,
                }),
            ],
        });
        const [row] = economics(ghost, "", "vendor");
        expect(row.calib).toBeCloseTo(2, 5); // 200 actual / 100 metered
        expect(row.flags).toEqual(["unmetered May 26"]);
    });

    it("treats pollen-priced vendors as 1.00 by construction, never flagged", () => {
        const mirror = emptyData({
            pollenMonthly: [
                usage({
                    month: "2026-06",
                    vendor: "community",
                    model: "user-model",
                    cost_paid: 80,
                    price_paid: 100,
                }),
            ],
        });
        const [row] = economics(mirror, "", "vendor");
        expect(row.calib).toBe(1);
        expect(row.pollenPriced).toBe(true);
        expect(row.flags).toEqual([]);
        expect(row.trueCostPaidUsd).toBeCloseTo(80, 5);
    });

    it("sorts most underpriced first, ratio-less rows last, and scopes by month", () => {
        const rows = economics(data, "2026-06", "model");
        const ratios = rows.map((row) => row.trueMultiplier);
        const defined = ratios.filter((value) => value != null);
        expect([...defined].sort((a, b) => a - b)).toEqual(defined);
        expect(ratios.slice(defined.length).every((v) => v == null)).toBe(true);
        expect(economics(data, "2026-05", "model")).toEqual([]);
    });

    it("reports a null multiplier for quest-only models", () => {
        const questOnly = emptyData({
            pollenMonthly: [
                usage({
                    vendor: "aws",
                    model: "free",
                    cost_paid: 0,
                    cost_quests: 10,
                    price_paid: 0,
                    price_quests: 12,
                }),
            ],
        });
        const [row] = economics(questOnly, "", "model");
        expect(row.trueMultiplier).toBeNull();
        expect(row.questBurnUsd).toBeCloseTo(10, 5);
        expect(row.flags).toEqual(["no meter"]);
    });
});

describe("providerEconomics", () => {
    it("uses OP Cloud and OP Pollen only, preserving the existing EconRow math", () => {
        const data = emptyData({
            providerMonthly: [
                provider({
                    vendor: "google",
                    paid: 99999,
                }),
            ],
            pollenMonthly: [
                usage({
                    vendor: "google",
                    cost_paid: 99999,
                    price_paid: 99999,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    paid: -4000,
                    credit: -1000,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    type: "infra",
                    paid: -9999,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    credit: 5000,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 600,
                    cost_quests: 200,
                    price_paid: 900,
                    price_quests: 250,
                    byop_paid: 50,
                    model_paid: 100,
                }),
            ],
        });

        const [row] = providerEconomics(data, "2026-06");
        expect(row.vendor).toBe("google");
        expect(row.model).toBeNull();
        expect(row.calib).toBeCloseTo(6.25, 5); // 5000 OP Cloud / 800 OP Pollen
        expect(row.creditSharePct).toBeCloseTo(20, 5);
        expect(row.trueCostPaidUsd).toBeCloseTo(3750, 5); // 600 × 6.25
        expect(row.questBurnUsd).toBeCloseTo(1250, 5); // 200 × 6.25
        expect(row.soldPaidUsd).toBe(900);
        expect(row.ecoPaidUsd).toBe(150);
        expect(row.retainedPaidUsd).toBe(750);
        expect(row.soldQuestsUsd).toBe(250);
        expect(row.trueMultiplier).toBeCloseTo(750 / 3750, 5);
        expect(row.marginUsd).toBeCloseTo(750 - 3750, 5);
        expect(row.flags).toEqual([]);
    });

    it("flags OP Pollen months that have no OP Cloud witness", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    paid: -500,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 250,
                    price_paid: 300,
                }),
                opPollen({
                    month: "2026-07",
                    vendor: "google",
                    cost_paid: 250,
                    price_paid: 300,
                }),
            ],
        });

        const [row] = providerEconomics(data, "");
        expect(row.calib).toBeCloseTo(1, 5);
        expect(row.flags).toEqual(["unwitnessed July 26"]);
    });

    it("flags OP Cloud months that have no OP Pollen meter", () => {
        const data = emptyData({
            opCloud: [
                opCloud({
                    start: "2026-05-01 00:00:00",
                    vendor: "google",
                    paid: -100,
                }),
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    paid: -100,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    cost_paid: 100,
                    price_paid: 120,
                }),
            ],
        });

        const [row] = providerEconomics(data, "");
        expect(row.calib).toBeCloseTo(2, 5);
        expect(row.flags).toEqual(["unmetered May 26"]);
    });

    it("falls back to OP Pollen cost when a provider has no OP Cloud meter", () => {
        const data = emptyData({
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "azure",
                    cost_paid: 50,
                    cost_quests: 50,
                    price_paid: 40,
                    price_quests: 45,
                }),
            ],
        });

        const [row] = providerEconomics(data, "2026-06");
        expect(row.vendor).toBe("azure");
        expect(row.calib).toBeNull();
        expect(row.flags).toEqual(["no meter"]);
        expect(row.trueCostPaidUsd).toBeCloseTo(50, 5);
        expect(row.trueMultiplier).toBeCloseTo(0.8, 5);
        expect(row.creditSharePct).toBeNull();
    });
});

describe("modelEconomics", () => {
    it("uses OP sources only and splits provider-calibrated economics by model", () => {
        const data = emptyData({
            providerMonthly: [
                provider({
                    vendor: "google",
                    paid: 99999,
                }),
            ],
            pollenMonthly: [
                usage({
                    vendor: "google",
                    model: "legacy-model",
                    cost_paid: 99999,
                    price_paid: 99999,
                }),
            ],
            opCloud: [
                opCloud({
                    start: "2026-06-01 00:00:00",
                    vendor: "google",
                    paid: -900,
                    credit: -300,
                }),
            ],
            opPollen: [
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    model: "gemini-flash",
                    cost_paid: 200,
                    price_paid: 500,
                    byop_paid: 20,
                    model_paid: 30,
                }),
                opPollen({
                    month: "2026-06",
                    vendor: "google",
                    model: "gemini-pro",
                    cost_paid: 300,
                    cost_quests: 100,
                    price_paid: 600,
                    price_quests: 110,
                }),
            ],
        });

        const rows = modelEconomics(data, "2026-06");
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.model).sort()).toEqual([
            "gemini-flash",
            "gemini-pro",
        ]);
        expect(rows.some((row) => row.model === "legacy-model")).toBe(false);

        const flash = rows.find((row) => row.model === "gemini-flash");
        const pro = rows.find((row) => row.model === "gemini-pro");
        if (!flash || !pro) throw new Error("model rows missing");

        expect(flash.vendor).toBe("google");
        expect(flash.calib).toBeCloseTo(2, 5); // 1200 OP Cloud / 600 OP Pollen
        expect(flash.creditSharePct).toBeCloseTo(25, 5);
        expect(flash.trueCostPaidUsd).toBeCloseTo(400, 5);
        expect(flash.questBurnUsd).toBeCloseTo(0, 5);
        expect(flash.retainedPaidUsd).toBe(450);
        expect(flash.trueMultiplier).toBeCloseTo(450 / 400, 5);

        expect(pro.calib).toBeCloseTo(2, 5);
        expect(pro.trueCostPaidUsd).toBeCloseTo(600, 5);
        expect(pro.questBurnUsd).toBeCloseTo(200, 5);
        expect(pro.retainedPaidUsd).toBe(600);
        expect(pro.trueMultiplier).toBeCloseTo(1, 5);
    });
});

const grant = (over: Partial<Data["grants"][number]>): OpCloudRow => {
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

    it("uses OP Cloud grant and burn rows instead of legacy provider rows", () => {
        const data = emptyData({
            providerMonthly: [
                provider({ month: "2026-06", vendor: "lambda", credit: 999 }),
            ],
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

    it("allocates burn to grants by active window, then overflow to open grants", () => {
        // aws shape: an early grant caps out, the leftover flows to a grant
        // that had not started yet (vendor-pooled burn cannot be attributed
        // per-grant more precisely).
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
        expect(late?.allocatedUsd).toBe(30); // overflow pass
        expect(row.remainingUsd).toBe(170);
        expect(row.flags).not.toContain("unallocated burn 30");
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

    it("includes pre-window burn rows that every other lens excludes", () => {
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
        // economics stays clamped: the 2025 row must not exist there
        expect(
            economics(data, "", "vendor").find((r) => r.vendor === "aws"),
        ).toBeUndefined();
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

describe("ungrantedCreditBurn", () => {
    it("lists credit burners without grants, excluding pollen-priced vendors", () => {
        const NOW = new Date("2026-07-08T12:00:00Z");
        const data = emptyData({
            opCloud: [
                grant({ vendor: "lambda", granted: 100 }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "alibaba",
                    credit: 87,
                }),
                opCreditBurn({
                    month: "2026-07",
                    vendor: "alibaba",
                    credit: 5,
                }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "airforce",
                    credit: 50,
                }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "lambda",
                    credit: 10,
                }),
                opCreditBurn({
                    month: "2026-06",
                    vendor: "deepinfra",
                    paid: 10,
                }),
            ],
        });
        const rows = ungrantedCreditBurn(data, NOW);
        expect(rows).toEqual([
            {
                vendor: "alibaba",
                burnedUsd: 92,
                lastMonthBurnUsd: 87,
                currentMonthBurnUsd: 5,
            },
        ]);
    });
});

describe("pnlStatement", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    // Two closed months plus the in-progress current month. Revenue rows only
    // in May and June, so July's cash P&L is null (spend-only).
    const data = emptyData({
        opTransactions: [
            opTxn({
                date: "2026-05-01",
                vendor: "stripe",
                category: "revenue",
                amount: 1000,
            }),
            opTxn({
                date: "2026-05-10",
                vendor: "aws",
                category: "cloud",
                amount: -300,
            }),
            opTxn({
                date: "2026-05-11",
                vendor: "runpod",
                category: "cloud",
                amount: -100,
            }),
            opTxn({
                date: "2026-05-25",
                vendor: "deel",
                category: "payroll",
                amount: -100,
            }),
            opTxn({
                date: "2026-06-01",
                vendor: "stripe",
                category: "revenue",
                amount: 2000,
            }),
            opTxn({
                date: "2026-06-05",
                vendor: "aws",
                category: "cloud",
                amount: -500,
            }),
            opTxn({
                date: "2026-06-06",
                vendor: "runpod",
                category: "cloud",
                amount: -100,
            }),
            opTxn({
                date: "2026-07-02",
                vendor: "aws",
                category: "cloud",
                amount: -50,
            }),
        ],
    });

    const lineByKey = (result: ReturnType<typeof pnlStatement>) =>
        new Map(result.lines.map((line) => [line.key, line]));

    it("lays out every in-window month ascending plus a YTD total for year/all", () => {
        const year = pnlStatement(data, "2026", now);
        expect(year.periods.map((p) => p.key)).toEqual([
            "2026-05",
            "2026-06",
            "2026-07",
            "total",
        ]);
        expect(year.periods.map((p) => p.kind)).toEqual([
            "month",
            "month",
            "month",
            "total",
        ]);
        expect(year.primary).toBe("total");

        const all = pnlStatement(data, "", now);
        expect(all.periods.map((p) => p.key)).toEqual([
            "2026-05",
            "2026-06",
            "2026-07",
            "total",
        ]);
    });

    it("lays out prior · selected · delta for a month filter", () => {
        const month = pnlStatement(data, "2026-06", now);
        expect(month.periods.map((p) => p.key)).toEqual([
            "2026-05",
            "2026-06",
            "delta",
        ]);
        expect(month.periods.map((p) => p.kind)).toEqual([
            "month",
            "month",
            "delta",
        ]);
        expect(month.primary).toBe("2026-06");
    });

    it("orders rows: revenue, categories (CATEGORY_ORDER + extras), spend, cash, margin", () => {
        const extra = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-05-01",
                    vendor: "x",
                    category: "zulu",
                    amount: -1,
                }),
                opTxn({
                    date: "2026-05-02",
                    vendor: "aws",
                    category: "cloud",
                    amount: -1,
                }),
            ],
        });
        const result = pnlStatement(extra, "2026", now);
        expect(result.lines.map((line) => line.key)).toEqual([
            "revenue",
            ...CATEGORY_ORDER,
            "zulu",
            "total-spend",
            "cash-pnl",
            "net-margin",
        ]);
        expect(result.lines.map((line) => line.kind)).toEqual([
            "revenue",
            ...CATEGORY_ORDER.map(() => "category"),
            "category", // zulu
            "total-spend",
            "cash-pnl",
            "net-margin",
        ]);
    });

    it("computes %rev against revenue on the primary period", () => {
        const year = pnlStatement(data, "2026", now);
        const lines = lineByKey(year);
        // YTD revenue = 1000 + 2000 = 3000; cloud spend = 400 + 600 + 50.
        expect(lines.get("revenue")?.values.total).toBe(3000);
        expect(lines.get("revenue")?.pctOfRevenue).toBe(100);
        expect(lines.get("cloud")?.values.total).toBe(1050);
        expect(lines.get("cloud")?.pctOfRevenue).toBeCloseTo(
            (1050 / 3000) * 100,
            6,
        );
        // total-spend = 1050 cloud + 100 payroll = 1150.
        expect(lines.get("total-spend")?.values.total).toBe(1150);
        expect(lines.get("total-spend")?.pctOfRevenue).toBeCloseTo(
            (1150 / 3000) * 100,
            6,
        );
    });

    it("reports net margin as cashPnl/revenue*100 per period", () => {
        const year = pnlStatement(data, "2026", now);
        const margin = lineByKey(year).get("net-margin");
        if (!margin) throw new Error("net-margin missing");
        // May: rev 1000, spend 500 (400 cloud + 100 payroll) → pnl 500 → 50%.
        expect(margin.values["2026-05"]).toBeCloseTo(50, 6);
        // June: rev 2000, spend 600 → pnl 1400 → 70%.
        expect(margin.values["2026-06"]).toBeCloseTo(70, 6);
        // July: spend-only, cashPnl null → margin null.
        expect(margin.values["2026-07"]).toBeNull();
        // YTD: rev 3000, cashPnl total = 500 + 1400 = 1900 → ~63.3%.
        expect(margin.values.total).toBeCloseTo((1900 / 3000) * 100, 6);
        // net-margin pctOfRevenue pins the primary period's value.
        expect(margin.pctOfRevenue).toBeCloseTo((1900 / 3000) * 100, 6);
    });

    it("computes delta = selected − prior with the correct sign", () => {
        const month = pnlStatement(data, "2026-06", now);
        const lines = lineByKey(month);
        // Revenue rose 1000 → 2000.
        expect(lines.get("revenue")?.values.delta).toBe(1000);
        // Cloud spend rose 400 → 600.
        expect(lines.get("cloud")?.values.delta).toBe(200);
        // Payroll fell 100 → 0 (present in May, absent in June) → -100.
        expect(lines.get("payroll")?.values["2026-05"]).toBe(100);
        expect(lines.get("payroll")?.values["2026-06"]).toBeNull();
        expect(lines.get("payroll")?.values.delta).toBeNull();
        // Cash P&L rose 500 → 1400.
        expect(lines.get("cash-pnl")?.values.delta).toBe(900);
    });

    it("attaches vendor sub-rows that sum to their category for every period", () => {
        const year = pnlStatement(data, "2026", now);
        const cloud = lineByKey(year).get("cloud");
        if (!cloud?.vendors) throw new Error("cloud vendors missing");
        expect(cloud.vendors.map((v) => v.vendor)).toContain("aws");
        expect(cloud.vendors.map((v) => v.vendor)).toContain("runpod");

        for (const period of year.periods) {
            const key = period.key;
            const categoryValue = cloud.values[key];
            const vendorSum = cloud.vendors.reduce(
                (total, vendor) => total + (vendor.values[key] ?? 0),
                0,
            );
            expect(vendorSum).toBeCloseTo(categoryValue ?? 0, 6);
        }
    });

    it("keeps vendor sub-rows aligned to category deltas in month view", () => {
        const month = pnlStatement(data, "2026-06", now);
        const cloud = lineByKey(month).get("cloud");
        if (!cloud?.vendors) throw new Error("cloud vendors missing");
        const vendorDeltaSum = cloud.vendors.reduce(
            (total, vendor) => total + (vendor.values.delta ?? 0),
            0,
        );
        expect(vendorDeltaSum).toBeCloseTo(cloud.values.delta ?? 0, 6);
    });

    it("flags the in-progress month on its period header only", () => {
        const year = pnlStatement(data, "2026", now);
        const byKey = new Map(year.periods.map((p) => [p.key, p]));
        expect(byKey.get("2026-05")?.inProgress).toBe(false);
        expect(byKey.get("2026-06")?.inProgress).toBe(false);
        expect(byKey.get("2026-07")?.inProgress).toBe(true);
    });

    it("nulls cash P&L for revenue-only and spend-only months", () => {
        const sparse = emptyData({
            opTransactions: [
                opTxn({
                    date: "2026-05-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 500,
                }),
                opTxn({
                    date: "2026-06-01",
                    vendor: "aws",
                    category: "cloud",
                    amount: -100,
                }),
            ],
        });
        const result = pnlStatement(sparse, "2026", now);
        const cash = lineByKey(result).get("cash-pnl");
        const margin = lineByKey(result).get("net-margin");
        // May: revenue-only (no spend) → cashPnl null.
        expect(cash?.values["2026-05"]).toBeNull();
        expect(margin?.values["2026-05"]).toBeNull();
        // June: spend-only (no revenue) → cashPnl null, margin null.
        expect(cash?.values["2026-06"]).toBeNull();
        expect(margin?.values["2026-06"]).toBeNull();
    });
});

describe("ecosystemTotals", () => {
    it("sums byop and model credits across paid and quests in scope", () => {
        const rows = [
            usage({
                month: "2026-06",
                byop_paid: 50,
                byop_quests: 5,
                model_paid: 100,
                model_quests: 8,
            }),
            usage({ month: "2026-05", byop_paid: 999 }),
        ];
        expect(ecosystemTotals(rows, "2026-06")).toEqual({
            byopUsd: 55,
            modelUsd: 108,
        });
        expect(ecosystemTotals(rows, "")).toEqual({
            byopUsd: 1054,
            modelUsd: 108,
        });
    });
});
