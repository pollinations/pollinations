import { describe, expect, it } from "vitest";
import type {
    Data,
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
    monthlyRevenue,
    monthSpendDetail,
    pnlByMonth,
    pnlStatement,
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

    it("ignores pre-window grant-burn rows entirely", () => {
        const data = emptyData({
            providerMonthly: [
                provider({ month: "2025-12", vendor: "aws", credit: 35000 }),
                provider({ month: "2026-04", credit: 10 }),
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
        expect(row.calibX).toBeCloseTo((4489.35 * 1.1518) / 4940, 5);
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
        expect(row.calibX).toBeNull();
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

    it("excludes pre-window grant-burn provider rows", () => {
        const data = emptyData({
            providerMonthly: [
                provider({ month: "2025-12", vendor: "aws", credit: 35000 }),
            ],
        });
        expect(vendorPlanes(data)).toEqual([]);
    });

    it("keeps infra rows out of the provider witness", () => {
        const data = emptyData({
            providerMonthly: [
                provider({
                    month: "2026-06",
                    vendor: "cloudflare",
                    category: "infra",
                    paid: 1073,
                }),
                provider({
                    month: "2026-06",
                    vendor: "aws",
                    category: "compute",
                    credit: 3986.47,
                }),
                provider({
                    month: "2026-06",
                    vendor: "aws",
                    category: "infra",
                    credit: 754.97,
                }),
            ],
        });
        const rows = vendorPlanes(data);
        // cloudflare is all infra — no row at all
        expect(rows.map((row) => row.vendor)).toEqual(["aws"]);
        // aws keeps only its compute slice
        expect(rows[0].providerUsd).toBeCloseTo(3986.47, 2);
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
                    vendor: "replicate",
                    paid: 36.26,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.coverage).toBe("paid unverified");
    });

    it("never alarms on sub-dollar provider paid amounts", () => {
        const data = emptyData({
            providerMonthly: [
                provider({
                    month: "2026-01",
                    vendor: "elevenlabs",
                    paid: 0.49,
                }),
            ],
        });
        const [row] = vendorPlanes(data);
        expect(row.coverage).toBeNull();
    });

    it("covers prepaid vendors while cumulative top-ups keep up with burn", () => {
        const data = emptyData({
            transactions: [
                txn({
                    date: "2026-04-02",
                    vendor: "vast.ai",
                    category: "compute",
                    charged_amount: 500,
                    charged_currency: "USD",
                }),
            ],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "vast.ai", paid: 66 }),
            ],
        });
        const rows = vendorPlanes(data);
        const june = rows.find((row) => row.month === "2026-06");
        expect(june?.coverage).toBe("prepaid");
    });

    it("still alarms when a prepaid balance is overdrawn", () => {
        const data = emptyData({
            providerMonthly: [
                provider({ month: "2026-06", vendor: "vast.ai", paid: 200 }),
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

const grant = (
    over: Partial<Data["grants"][number]>,
): Data["grants"][number] => ({
    vendor: "lambda",
    label: "",
    granted: 0,
    currency: "USD",
    start_date: "2026-03-01",
    expires: "1970-01-01",
    ...over,
});

describe("creditRunway", () => {
    const NOW = new Date("2026-07-08T12:00:00Z"); // day 8 of July

    it("pools grants per vendor, converts EUR at the start month, and nets naive remaining", () => {
        const data = emptyData({
            grants: [
                grant({ vendor: "fireworks", label: "a", granted: 700 }),
                grant({ vendor: "fireworks", label: "b", granted: 300 }),
                grant({
                    vendor: "ovhcloud",
                    granted: 1000,
                    currency: "EUR",
                    start_date: "2026-03-09",
                }),
            ],
            providerMonthly: [
                provider({ month: "2026-04", vendor: "fireworks", credit: 80 }),
                provider({ month: "2026-05", vendor: "fireworks", credit: 20 }),
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

    it("projects depletion from last full-month base and current-month intensity", () => {
        const data = emptyData({
            grants: [grant({ vendor: "lambda", granted: 1000 })],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "lambda", credit: 100 }),
                provider({ month: "2026-07", vendor: "lambda", credit: 80 }),
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
            grants: [grant({ vendor: "aws", granted: 10000 })],
            providerMonthly: [
                provider({ month: "2026-05", vendor: "aws", credit: 3000 }),
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
            grants: [grant({ vendor: "lambda", granted: 1000 })],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "lambda", credit: 50 }),
            ],
        });
        const [row] = creditRunway(data, NOW);
        expect(row.rateBasis).toBe("last");
        expect(row.monthlyRateUsd).toBe(50);
        const dormant = creditRunway(
            emptyData({ grants: [grant({ vendor: "lambda", granted: 10 })] }),
            NOW,
        );
        expect(dormant[0].monthlyRateUsd).toBeNull();
        expect(dormant[0].depletionDate).toBeNull();
    });

    it("lets an upcoming expiry beat a later burn date", () => {
        const data = emptyData({
            grants: [
                grant({
                    vendor: "digitalocean",
                    granted: 1000,
                    expires: "2026-07-22",
                }),
            ],
            providerMonthly: [
                provider({
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
            grants: [
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
            ],
            providerMonthly: [
                provider({
                    month: "2026-04",
                    vendor: "elevenlabs",
                    credit: 120,
                }),
                provider({ month: "2026-04", vendor: "runpod", credit: 100 }),
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
            grants: [
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
            ],
            providerMonthly: [
                provider({ month: "2026-01", vendor: "aws", credit: 130 }),
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

    it("reports grant statuses for the raw Grants tab", () => {
        const data = emptyData({
            grants: [
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
            ],
            providerMonthly: [
                provider({ month: "2026-04", vendor: "runpod", credit: 50 }),
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
            grants: [
                grant({
                    vendor: "aws",
                    granted: 100000,
                    start_date: "2025-09-01",
                }),
            ],
            providerMonthly: [
                provider({ month: "2025-12", vendor: "aws", credit: 35000 }),
                provider({ month: "2026-01", vendor: "aws", credit: 45000 }),
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
            grants: [
                grant({ vendor: "lambda", granted: 100 }),
                grant({
                    vendor: "digitalocean",
                    granted: 1000,
                    expires: "2026-07-22",
                }),
                grant({ vendor: "fireworks", granted: 50 }), // dormant, no depletion
            ],
            providerMonthly: [
                provider({ month: "2026-07", vendor: "lambda", credit: 90 }),
                provider({
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
            grants: [
                grant({
                    vendor: "pointsflyer",
                    label: "gifted compute",
                    granted: 100,
                    start_date: "2025-12-01",
                    expires: "2026-04-30",
                }),
            ],
            providerMonthly: [
                provider({
                    month: "2026-01",
                    vendor: "pointsflyer",
                    credit: 60,
                }),
                provider({
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
            grants: [grant({ vendor: "lambda", granted: 100 })],
            providerMonthly: [
                provider({ month: "2026-06", vendor: "alibaba", credit: 87 }),
                provider({ month: "2026-07", vendor: "alibaba", credit: 5 }),
                provider({ month: "2026-06", vendor: "airforce", credit: 50 }),
                provider({ month: "2026-06", vendor: "lambda", credit: 10 }),
                provider({ month: "2026-06", vendor: "deepinfra", paid: 10 }),
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

    // Two closed months plus the in-progress current month. Revenue only in
    // May and June, so July's cash P&L is null (spend-only).
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
                date: "2026-05-11",
                vendor: "runpod",
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
                date: "2026-06-05",
                vendor: "aws",
                category: "compute",
                charged_amount: 500,
                charged_currency: "USD",
            }),
            txn({
                date: "2026-06-06",
                vendor: "runpod",
                category: "compute",
                charged_amount: 100,
                charged_currency: "USD",
            }),
            txn({
                date: "2026-07-02",
                vendor: "aws",
                category: "compute",
                charged_amount: 50,
                charged_currency: "USD",
            }),
        ],
        providerMonthly: [
            provider({ month: "2026-05", vendor: "lambda", credit: 200 }),
            provider({ month: "2026-06", vendor: "lambda", credit: 300 }),
        ],
        revenueMonthly: [
            {
                source: "stripe",
                month: "2026-05",
                currency: "USD",
                gross_amount: 1000,
                fees_amount: 0,
                refunds_amount: 0,
            },
            {
                source: "stripe",
                month: "2026-06",
                currency: "USD",
                gross_amount: 2000,
                fees_amount: 0,
                refunds_amount: 0,
            },
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

    it("orders rows: revenue, categories (CATEGORY_ORDER + extras), spend, cash, margin, credit", () => {
        const extra = emptyData({
            transactions: [
                txn({
                    date: "2026-05-01",
                    vendor: "x",
                    category: "zulu",
                    charged_amount: 1,
                    charged_currency: "USD",
                }),
                txn({
                    date: "2026-05-02",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 1,
                    charged_currency: "USD",
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
            "credit-burn",
        ]);
        expect(result.lines.map((line) => line.kind)).toEqual([
            "revenue",
            ...CATEGORY_ORDER.map(() => "category"),
            "category", // zulu
            "total-spend",
            "cash-pnl",
            "net-margin",
            "credit-burn",
        ]);
    });

    it("computes %rev against revenue on the primary period", () => {
        const year = pnlStatement(data, "2026", now);
        const lines = lineByKey(year);
        // YTD revenue = 1000 + 2000 = 3000; compute spend = 400 + 600 + 50.
        expect(lines.get("revenue")?.values.total).toBe(3000);
        expect(lines.get("revenue")?.pctOfRevenue).toBe(100);
        expect(lines.get("compute")?.values.total).toBe(1050);
        expect(lines.get("compute")?.pctOfRevenue).toBeCloseTo(
            (1050 / 3000) * 100,
            6,
        );
        // total-spend = 1050 compute + 100 payroll = 1150.
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
        // May: rev 1000, spend 500 (400 compute + 100 payroll) → pnl 500 → 50%.
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
        // Compute spend rose 400 → 600.
        expect(lines.get("compute")?.values.delta).toBe(200);
        // Payroll fell 100 → 0 (present in May, absent in June) → -100.
        expect(lines.get("payroll")?.values["2026-05"]).toBe(100);
        expect(lines.get("payroll")?.values["2026-06"]).toBeNull();
        expect(lines.get("payroll")?.values.delta).toBeNull();
        // Cash P&L rose 500 → 1400.
        expect(lines.get("cash-pnl")?.values.delta).toBe(900);
        // Credit burn rose 200 → 300.
        expect(lines.get("credit-burn")?.values.delta).toBe(100);
    });

    it("attaches vendor sub-rows that sum to their category for every period", () => {
        const year = pnlStatement(data, "2026", now);
        const compute = lineByKey(year).get("compute");
        if (!compute?.vendors) throw new Error("compute vendors missing");
        expect(compute.vendors.map((v) => v.vendor)).toContain("aws");
        expect(compute.vendors.map((v) => v.vendor)).toContain("runpod");

        for (const period of year.periods) {
            const key = period.key;
            const categoryValue = compute.values[key];
            const vendorSum = compute.vendors.reduce(
                (total, vendor) => total + (vendor.values[key] ?? 0),
                0,
            );
            expect(vendorSum).toBeCloseTo(categoryValue ?? 0, 6);
        }
    });

    it("keeps vendor sub-rows aligned to category deltas in month view", () => {
        const month = pnlStatement(data, "2026-06", now);
        const compute = lineByKey(month).get("compute");
        if (!compute?.vendors) throw new Error("compute vendors missing");
        const vendorDeltaSum = compute.vendors.reduce(
            (total, vendor) => total + (vendor.values.delta ?? 0),
            0,
        );
        expect(vendorDeltaSum).toBeCloseTo(compute.values.delta ?? 0, 6);
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
            transactions: [
                txn({
                    date: "2026-06-01",
                    vendor: "aws",
                    category: "compute",
                    charged_amount: 100,
                    charged_currency: "USD",
                }),
            ],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-05",
                    currency: "USD",
                    gross_amount: 500,
                    fees_amount: 0,
                    refunds_amount: 0,
                },
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
