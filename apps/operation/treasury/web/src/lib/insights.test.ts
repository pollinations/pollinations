import { describe, expect, it } from "vitest";
import type {
    Data,
    PollenMonthlyRow,
    ProviderMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import {
    breakEvenMultiplier,
    CATEGORY_ORDER,
    categoryColumns,
    ecosystemTotals,
    globalNetRatio,
    insightVendorOptions,
    modelEconomics,
    monthlyRevenue,
    monthSpendDetail,
    pnlByMonth,
    transactionCashUsd,
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
    runs: [],
    revenueMonthly: [],
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

    it("blends revenue, category spend, and credit shadow per month", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-05-10",
                    category: "compute",
                    charged_amount: 1000,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-05-25",
                    category: "payroll",
                    charged_amount: 100,
                    charged_currency: "EUR",
                }),
                txn({
                    date: "2026-06-01",
                    category: "compute",
                    charged_amount: 50,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-07-02",
                    category: "compute",
                    charged_amount: 10,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [provider({ month: "2026-05", credit: 200 })],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-05",
                    currency: "EUR",
                    gross_amount: 2000,
                    fees_amount: 180,
                    refunds_amount: 0,
                },
            ],
        });
        const [may, june, july] = pnlByMonth(data, now);

        expect(may.month).toBe("2026-05");
        expect(may.categories.compute).toBe(1000);
        expect(may.categories.payroll).toBeCloseTo(116.73, 2);
        expect(may.spendUsd).toBeCloseTo(1116.73, 2);
        expect(may.revenueNetUsd).toBeCloseTo(1820 * 1.1673, 1);
        expect(may.cashPnlUsd).toBeCloseTo(1820 * 1.1673 - 1116.73, 1);
        expect(may.creditBurnUsd).toBe(200);
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
            providerMonthly: [provider({ month: "2026-04", credit: 10 })],
        });
        const [april] = pnlByMonth(data, now);
        expect(april.month).toBe("2026-04");
        expect(april.spendUsd).toBeNull();
        expect(april.cashPnlUsd).toBeNull();
        expect(april.creditBurnUsd).toBe(10);
    });
});

describe("monthSpendDetail", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("groups the month's cash by category and vendor with shares", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-05-10",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 300,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-05-12",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 100,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-05-25",
                    vendor: "deel",
                    category: "payroll",
                    charged_amount: 100,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-04-01",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 999,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [
                provider({ month: "2026-05", vendor: "azure", credit: 50 }),
                provider({
                    month: "2026-05",
                    vendor: "aws",
                    credit: 0,
                    paid: 10,
                }),
            ],
        });
        const detail = monthSpendDetail(data, "2026-05", now);

        expect(detail.spend).toEqual([
            {
                category: "compute",
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
        expect(detail.creditBurn).toEqual([{ vendor: "azure", creditUsd: 50 }]);
        expect(detail.summary?.month).toBe("2026-05");
    });

    it("returns empty structures for a month with no data", () => {
        const detail = monthSpendDetail(emptyData({}), "2026-05", now);
        expect(detail.spend).toEqual([]);
        expect(detail.creditBurn).toEqual([]);
        expect(detail.summary).toBeNull();
    });
});

describe("categoryColumns", () => {
    it("keeps the fixed order and appends unknown categories sorted", () => {
        const months = pnlByMonth(
            emptyData({
                transactions: [
                    txn({
                        date: "2026-05-01",
                        category: "zulu",
                        charged_amount: 1,
                        charged_currency: "USD",
                    }),
                    txn({
                        date: "2026-05-02",
                        category: "compute",
                        charged_amount: 1,
                        charged_currency: "USD",
                    }),
                ],
            }),
            new Date("2026-07-06T12:00:00Z"),
        );
        expect(categoryColumns(months)).toEqual([...CATEGORY_ORDER, "zulu"]);
    });
});

describe("vendorPlanes", () => {
    it("aligns the three planes on (month, vendor) and converts currencies", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-06-13",
                    vendor: "google",
                    category: "compute",
                    charged_amount: 5000,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-06-14",
                    vendor: "google",
                    category: "saas",
                    charged_amount: 999,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [
                provider({
                    month: "2026-06",
                    vendor: "google",
                    currency: "EUR",
                    credit: 100,
                    paid: 4389.35,
                }),
            ],
            pollenMonthly: [
                usage({ vendor: "google", cost_paid: 3000, cost_quests: 1940 }),
            ],
        });
        const [row] = vendorPlanes(data);

        expect(row.month).toBe("2026-06");
        expect(row.vendor).toBe("google");
        expect(row.transactionsUsd).toBe(5000); // saas row excluded — compute only
        expect(row.providerUsd).toBeCloseTo(4489.35 * 1.1518, 1);
        expect(row.creditUsd).toBeCloseTo(100 * 1.1518, 2);
        expect(row.pollenUsd).toBe(4940);
        expect(row.providerVsPollenPct).toBeCloseTo(
            ((4489.35 * 1.1518 - 4940) / 4940) * 100,
            3,
        );
    });

    it("keeps missing planes null instead of zero", () => {
        const data = emptyData({
            pollenMonthly: [usage({ vendor: "runpod", cost_paid: 10 })],
        });
        const [row] = vendorPlanes(data);
        expect(row.transactionsUsd).toBeNull();
        expect(row.providerUsd).toBeNull();
        expect(row.creditUsd).toBeNull();
        expect(row.pollenUsd).toBe(10);
        expect(row.providerVsPollenPct).toBeNull();
    });

    it("skips transactions with a malformed month key", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 500,
                    charged_currency: "USD",
                }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });
});

describe("coverage", () => {
    it("classifies funded, adjacent-cash, internal, and uncovered months", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-06-13",
                    vendor: "google",
                    category: "compute",
                    charged_amount: 5000,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-05-11",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 4044,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "azure", credit: 3000 }),
                provider({ month: "2026-06", vendor: "aws", paid: 4698 }),
            ],
            pollenMonthly: [
                usage({ month: "2026-06", vendor: "google", cost_paid: 4000 }),
                usage({ month: "2026-06", vendor: "azure", cost_paid: 4000 }),
                usage({ month: "2026-06", vendor: "aws", cost_paid: 3500 }),
                usage({
                    month: "2026-06",
                    vendor: "openrouter",
                    cost_paid: 1000,
                }),
                usage({ month: "2026-06", vendor: "community", cost_paid: 50 }),
            ],
        });
        const byKey = new Map(
            vendorPlanes(data).map((row) => [
                `${row.month}|${row.vendor}`,
                row.coverage,
            ]),
        );
        expect(byKey.get("2026-06|google")).toBe("ok cash");
        expect(byKey.get("2026-06|azure")).toBe("ok credit");
        // aws paid in May for June consumption — adjacent cash, no alarm
        expect(byKey.get("2026-06|aws")).toBe("cash ±1mo");
        expect(byKey.get("2026-06|openrouter")).toBe("uncovered");
        expect(byKey.get("2026-06|community")).toBe("internal");
    });

    it("flags provider cash the bank never saw", () => {
        const data = emptyData({
            providerMonthly: [
                provider({
                    month: "2026-05",
                    vendor: "deepinfra",
                    paid: 36.26,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.coverage).toBe("paid unverified");
    });

    it("ignores sub-dollar pollen noise", () => {
        const data = emptyData({
            pollenMonthly: [
                usage({ month: "2026-06", vendor: "fal", cost_paid: 0.5 }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.coverage).toBeNull();
    });
});

describe("insightVendorOptions", () => {
    it("unions vendors across planes, compute transactions only", () => {
        const data = emptyData({
            transactions: [
                txn({ vendor: "aws", category: "compute" }),
                txn({ vendor: "deel", category: "payroll" }),
            ],
            providerMonthly: [provider({ vendor: "ovhcloud" })],
            pollenMonthly: [usage({ vendor: "google" })],
        });
        expect(insightVendorOptions(data)).toEqual([
            "all",
            "aws",
            "google",
            "ovhcloud",
        ]);
    });
});

describe("modelEconomics", () => {
    const data = emptyData({
        providerMonthly: [
            provider({
                month: "2026-06",
                vendor: "google",
                currency: "USD",
                credit: 0,
                paid: 5000,
            }),
        ],
        transactions: [
            txn({
                date: "2026-06-10",
                vendor: "elevenlabs",
                category: "compute",
                charged_amount: 300,
                charged_currency: "USD",
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
                vendor: "elevenlabs",
                model: "eleven-v3",
                cost_paid: 200,
                cost_quests: 0,
                price_paid: 260,
                price_quests: 0,
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

    it("allocates vendor actuals by registered-cost share and margins on retained", () => {
        const rows = modelEconomics(data, "2026-06", 0.9);
        const geminiA = rows.find((row) => row.model === "gemini-a");
        if (!geminiA) throw new Error("gemini-a missing");

        expect(geminiA.basis).toBe("provider");
        expect(geminiA.pollenCostUsd).toBe(800);
        expect(geminiA.sharePct).toBeCloseTo(80, 5); // 800 of google's 1000
        expect(geminiA.trueCostUsd).toBeCloseTo(4000, 5); // 5000 × 0.8
        expect(geminiA.grossPaidUsd).toBe(900);
        expect(geminiA.ecoPaidUsd).toBe(150); // 50 byop + 100 model, paid side
        expect(geminiA.retainedPaidUsd).toBe(750);
        expect(geminiA.grossQuestsUsd).toBe(250);
        expect(geminiA.marginUsd).toBeCloseTo(750 * 0.9 - 4000, 5);
        expect(geminiA.effectiveMultiplier).toBeCloseTo(1.5, 5); // gross 900/600
    });

    it("falls back to cash then registered bases", () => {
        const rows = modelEconomics(data, "2026-06", null);
        const eleven = rows.find((row) => row.vendor === "elevenlabs");
        const azure = rows.find((row) => row.vendor === "azure");
        if (!eleven || !azure) throw new Error("rows missing");

        expect(eleven.basis).toBe("transactions");
        expect(eleven.trueCostUsd).toBeCloseTo(300, 5);
        expect(azure.basis).toBe("pollen");
        expect(azure.trueCostUsd).toBeCloseTo(100, 5);
        expect(azure.effectiveMultiplier).toBeCloseTo(0.8, 5); // 40/50
    });

    it("sorts worst margin first and respects the month filter", () => {
        const rows = modelEconomics(data, "2026-06", null);
        const margins = rows.map((row) => row.marginUsd);
        expect([...margins].sort((a, b) => a - b)).toEqual(margins);
        expect(modelEconomics(data, "2026-05", null)).toEqual([]);
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
        const [row] = modelEconomics(questOnly, "", null);
        expect(row.effectiveMultiplier).toBeNull();
        expect(row.basis).toBe("pollen");
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
