import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import { fleetRunRate, gpuEconomics, runwayChips } from "./gpu";

const base: Data = {
    transactions: [],
    providerMonthly: [],
    pollenMonthly: [],
    grants: [],
    runs: [],
    revenueMonthly: [],
    gpuFleet: [],
    gpuBilling: [],
};

const JUNE_FLEET = [
    {
        recorded_at: "2026-06-10 10:00:00",
        vendor: "runpod",
        deployment: "zimage-4090-secure",
        gpu: "RTX 4090",
        gpu_count: 1,
        usd_per_hr: 0.75,
        balance_usd: 500,
    },
    {
        recorded_at: "2026-06-10 10:00:00",
        vendor: "runpod",
        deployment: "klein-a5000-v4",
        gpu: "RTX A5000",
        gpu_count: 1,
        usd_per_hr: 0.25,
        balance_usd: 500,
    },
];

const data: Data = {
    ...base,
    gpuFleet: JUNE_FLEET,
    providerMonthly: [
        {
            month: "2026-06",
            vendor: "runpod",
            currency: "USD",
            category: "compute",
            credit: 800,
            paid: 200,
            source: "api",
        },
    ],
    pollenMonthly: [
        {
            source: "tinybird",
            month: "2026-06",
            vendor: "runpod",
            model: "zimage",
            currency: "POLLEN",
            cost_paid: 100,
            cost_quests: 50,
            price_paid: 1200,
            price_quests: 300,
            byop_paid: 100,
            byop_quests: 0,
            model_paid: 100,
            model_quests: 0,
            requests: 400000,
        },
        {
            source: "tinybird",
            month: "2026-06",
            vendor: "runpod",
            model: "klein",
            currency: "POLLEN",
            cost_paid: 10,
            cost_quests: 5,
            price_paid: 300,
            price_quests: 60,
            byop_paid: 0,
            byop_quests: 0,
            model_paid: 0,
            model_quests: 0,
            requests: 30000,
        },
    ],
    revenueMonthly: [
        {
            source: "stripe",
            month: "2026-06",
            currency: "EUR",
            gross_amount: 10000,
            fees_amount: 500,
            refunds_amount: 400,
        },
    ],
};

describe("gpuEconomics", () => {
    it("allocates vendor rent by $/hr share and sums to the bill", () => {
        const rows = gpuEconomics(data, "2026-06");
        const total = rows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(1000, 2); // credit 800 + paid 200, USD
        const zimage = rows.find((r) => r.models.includes("zimage"));
        expect(zimage?.rentUsd).toBeCloseTo(750, 2); // 0.75 / 1.00 share
    });
    it("computes effective unit cost from requests", () => {
        const zimage = gpuEconomics(data, "2026-06").find((r) =>
            r.models.includes("zimage"),
        );
        expect(zimage?.effUsdPerReq).toBeCloseTo(750 / 400000, 6);
    });
    it("renders null rent (not 0) when no provider bill exists", () => {
        const noBill = { ...data, providerMonthly: [] };
        const zimage = gpuEconomics(noBill, "2026-06").find((r) =>
            r.models.includes("zimage"),
        );
        expect(zimage?.rentUsd).toBeNull();
        expect(zimage?.coverage).toBeNull();
    });
    it("flags fleet deployments no group matches", () => {
        const stray = {
            ...data,
            gpuFleet: [
                ...JUNE_FLEET,
                {
                    recorded_at: "2026-06-10 10:00:00",
                    vendor: "runpod",
                    deployment: "mystery-pod",
                    gpu: "H100",
                    gpu_count: 1,
                    usd_per_hr: 2,
                    balance_usd: 500,
                },
            ],
        };
        const rows = gpuEconomics(stray, "2026-06");
        expect(rows.some((r) => r.flags.includes("unmapped fleet"))).toBe(true);
    });
});

describe("fleetRunRate", () => {
    it("sums the latest snapshot only", () => {
        const rate = fleetRunRate(data);
        expect(rate?.usdPerHr).toBeCloseTo(1.0, 3);
        expect(rate?.usdPerMonth).toBeCloseTo(730, 0);
    });
});

describe("runwayChips", () => {
    it("derives days from balance and burn, danger under 7d", () => {
        const low = {
            ...data,
            gpuFleet: JUNE_FLEET.map((r) => ({ ...r, balance_usd: 50 })),
        };
        const chip = runwayChips(low, new Date("2026-06-11")).find(
            (c) => c.vendor === "runpod",
        );
        expect(chip?.tone).toBe("danger"); // 50 / (1.0 $/hr × 24) ≈ 2.1d
    });
});

describe("gpuEconomics — unattributed pollen flag", () => {
    // Vendor with groups claiming ["zimage"] + pollen rows for zimage AND flux.
    // The group for zimage pods claims only "zimage"; "flux" is in no group's
    // models list for runpod → it must appear in the unattributed flag on every
    // row for that vendor+month, and flux's numbers must NOT appear in any row.
    it("flags unclaimed pollen model on every row; its numbers stay out", () => {
        const d: Data = {
            ...base,
            gpuFleet: JUNE_FLEET, // zimage + klein pods
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 0,
                    paid: 1000,
                    source: "api",
                },
            ],
            pollenMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "runpod",
                    model: "zimage",
                    currency: "POLLEN",
                    cost_paid: 0,
                    cost_quests: 0,
                    price_paid: 500,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests: 200000,
                },
                // flux: unclaimed model — 92 500 requests, ~$92 revenue
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "runpod",
                    model: "flux",
                    currency: "POLLEN",
                    cost_paid: 0,
                    cost_quests: 0,
                    price_paid: 92,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests: 92500,
                },
            ],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-06",
                    currency: "USD",
                    gross_amount: 10000,
                    fees_amount: 500,
                    refunds_amount: 0,
                },
            ],
        };

        const rows = gpuEconomics(d, "2026-06");

        // Every row for runpod June must carry the unattributed flag for flux.
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.flags.some((f) => f.startsWith("unattributed:"))).toBe(
                true,
            );
            expect(row.flags.find((f) => f.startsWith("unattributed:"))).toBe(
                "unattributed: flux",
            );
        }

        // flux's requests and paidUsd must NOT appear in any row's totals.
        const totalRequests = rows.reduce((acc, r) => acc + r.requests, 0);
        const totalPaidUsd = rows.reduce((acc, r) => acc + r.paidUsd, 0);
        // Only zimage's 200 000 requests should be counted (klein has no pollen here)
        expect(totalRequests).toBe(200000);
        // Only zimage's $500 should be counted
        expect(totalPaidUsd).toBeCloseTo(500, 2);
    });

    it("emits no unattributed flag when all pollen models are claimed", () => {
        // All pollen models (zimage, klein) are in GPU_DEPLOYMENT_GROUPS for runpod.
        const rows = gpuEconomics(data, "2026-06");
        for (const row of rows) {
            expect(row.flags.some((f) => f.startsWith("unattributed:"))).toBe(
                false,
            );
        }
    });

    it("vendor-total no-fleet row does NOT carry unattributed flag even with unclaimed models", () => {
        // io.net has no fleet → goes through the no-fleet path which
        // aggregates ALL pollen rows. "flux" is not in any io.net group but
        // since all pollen is included in the row the flag is contradictory
        // and must NOT appear.
        const d: Data = {
            ...base,
            gpuFleet: [],
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "io.net",
                    currency: "USD",
                    category: "compute",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
            ],
            pollenMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "io.net",
                    model: "flux",
                    currency: "POLLEN",
                    cost_paid: 0,
                    cost_quests: 0,
                    price_paid: 200,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests: 50000,
                },
            ],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-06",
                    currency: "USD",
                    gross_amount: 10000,
                    fees_amount: 500,
                    refunds_amount: 0,
                },
            ],
        };
        const rows = gpuEconomics(d, "2026-06");
        expect(rows.length).toBe(1);
        // Fallback row aggregates ALL pollen — no model is excluded, so no flag.
        expect(rows[0].flags.some((f) => f.startsWith("unattributed:"))).toBe(
            false,
        );
        // The pollen revenue and requests ARE included in the vendor-total row.
        expect(rows[0].requests).toBe(50000);
        expect(rows[0].paidUsd).toBeCloseTo(200, 2);
    });
});

// --- Additional invariant tests (not in brief) ---

describe("gpuEconomics invariants", () => {
    it("rent-sum-equals-bill exactly with 3+ groups (remainder allocation kills float drift)", () => {
        // 3 groups: a 0.75/hr + 0.25/hr + 0.50/hr = 1.50/hr total; vendor bill = 300
        const fleet3 = [
            {
                recorded_at: "2026-05-15 00:00:00",
                vendor: "runpod",
                deployment: "zimage-main",
                gpu: "RTX 4090",
                gpu_count: 1,
                usd_per_hr: 0.75,
                balance_usd: 400,
            },
            {
                recorded_at: "2026-05-15 00:00:00",
                vendor: "runpod",
                deployment: "klein-primary",
                gpu: "RTX A5000",
                gpu_count: 1,
                usd_per_hr: 0.25,
                balance_usd: 400,
            },
            // unmatched so will be an "unmapped fleet" row with remaining share
            {
                recorded_at: "2026-05-15 00:00:00",
                vendor: "runpod",
                deployment: "mystery-node",
                gpu: "H100",
                gpu_count: 1,
                usd_per_hr: 0.5,
                balance_usd: 400,
            },
        ];
        const d: Data = {
            ...base,
            gpuFleet: fleet3,
            providerMonthly: [
                {
                    month: "2026-05",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 200,
                    paid: 100,
                    source: "api",
                },
            ],
            pollenMonthly: [],
            revenueMonthly: [],
        };
        const rows = gpuEconomics(d, "2026-05");
        const total = rows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(300, 6); // exact float sum = vendor bill
    });

    it("serverless rows get 'raise?' verdict not 'idle-candidate' even at 0 coverage", () => {
        // modal has serverless kind; zero coverage should give "raise?" not "idle-candidate"
        const modalData: Data = {
            ...base,
            gpuFleet: [],
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "modal",
                    currency: "USD",
                    category: "compute",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
            ],
            pollenMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "modal",
                    model: "some-model",
                    currency: "POLLEN",
                    cost_paid: 10,
                    cost_quests: 0,
                    price_paid: 1,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests: 1000,
                },
            ],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-06",
                    currency: "USD",
                    gross_amount: 10000,
                    fees_amount: 500,
                    refunds_amount: 0,
                },
            ],
        };
        const rows = gpuEconomics(modalData, "2026-06");
        const modalRow = rows.find((r) => r.vendor === "modal");
        expect(modalRow).toBeDefined();
        // coverage < 0.4, but serverless → should be "raise?" not "idle-candidate"
        expect(modalRow?.verdict).not.toBe("idle-candidate");
        expect(modalRow?.verdict).toBe("raise?");
    });

    it("no provider bill yields null coverage (not 0)", () => {
        const d: Data = {
            ...base,
            gpuFleet: JUNE_FLEET,
            providerMonthly: [],
            pollenMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "runpod",
                    model: "zimage",
                    currency: "POLLEN",
                    cost_paid: 10,
                    cost_quests: 0,
                    price_paid: 500,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests: 10000,
                },
            ],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-06",
                    currency: "USD",
                    gross_amount: 5000,
                    fees_amount: 100,
                    refunds_amount: 0,
                },
            ],
        };
        const rows = gpuEconomics(d, "2026-06");
        for (const row of rows) {
            expect(row.rentUsd).toBeNull();
            expect(row.coverage).toBeNull();
        }
    });

    it("multi-month: each month carries only its own bill, grand total = sum of months", () => {
        // runpod: May credit 100, June credit 200 → filter "2026" emits both months
        const mayFleet = [
            {
                recorded_at: "2026-05-15 00:00:00",
                vendor: "runpod",
                deployment: "zimage-main",
                gpu: "RTX 4090",
                gpu_count: 1,
                usd_per_hr: 0.75,
                balance_usd: 400,
            },
            {
                recorded_at: "2026-05-15 00:00:00",
                vendor: "runpod",
                deployment: "klein-primary",
                gpu: "RTX A5000",
                gpu_count: 1,
                usd_per_hr: 0.25,
                balance_usd: 400,
            },
        ];
        const juneFleet = JUNE_FLEET;
        const d: Data = {
            ...base,
            gpuFleet: [...mayFleet, ...juneFleet],
            providerMonthly: [
                {
                    month: "2026-05",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 200,
                    paid: 0,
                    source: "api",
                },
            ],
            pollenMonthly: [],
            revenueMonthly: [],
        };
        const rows = gpuEconomics(d, "2026");
        const mayRows = rows.filter(
            (r) => r.vendor === "runpod" && r.month === "2026-05",
        );
        const juneRows = rows.filter(
            (r) => r.vendor === "runpod" && r.month === "2026-06",
        );
        const mayTotal = mayRows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        const juneTotal = juneRows.reduce(
            (acc, r) => acc + (r.rentUsd ?? 0),
            0,
        );
        const grandTotal = rows
            .filter((r) => r.vendor === "runpod")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        // each month's rows must sum to that month's bill exactly
        expect(mayTotal).toBeCloseTo(100, 6);
        expect(juneTotal).toBeCloseTo(200, 6);
        // grand total must equal sum of the two months, not double-counted
        expect(grandTotal).toBeCloseTo(300, 6);
    });

    it("multi-month no-fleet vendor: cross-month rent does not leak (io.net)", () => {
        // io.net has no fleet — emits one vendor-total row per month.
        // With bills in two months, each month row must carry only its own bill.
        const d: Data = {
            ...base,
            gpuFleet: [],
            providerMonthly: [
                {
                    month: "2026-05",
                    vendor: "io.net",
                    currency: "USD",
                    category: "compute",
                    credit: 150,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "io.net",
                    currency: "USD",
                    category: "compute",
                    credit: 250,
                    paid: 0,
                    source: "api",
                },
            ],
            pollenMonthly: [],
            revenueMonthly: [],
        };
        const rows = gpuEconomics(d, "2026");
        const mayRow = rows.find(
            (r) => r.vendor === "io.net" && r.month === "2026-05",
        );
        const juneRow = rows.find(
            (r) => r.vendor === "io.net" && r.month === "2026-06",
        );
        expect(mayRow?.rentUsd).toBeCloseTo(150, 6);
        expect(juneRow?.rentUsd).toBeCloseTo(250, 6);
        const grandTotal = rows
            .filter((r) => r.vendor === "io.net")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(grandTotal).toBeCloseTo(400, 6);
    });

    it("infra category rows excluded from rent", () => {
        const dWithInfra: Data = {
            ...base,
            gpuFleet: JUNE_FLEET,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 800,
                    paid: 200,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "infra",
                    credit: 9999,
                    paid: 9999,
                    source: "api",
                },
            ],
            pollenMonthly: [],
            revenueMonthly: [],
        };
        const rows = gpuEconomics(dWithInfra, "2026-06");
        const total = rows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        // infra row must not be counted
        expect(total).toBeCloseTo(1000, 2);
    });
});

describe("gpuEconomics — billing-preferred allocation", () => {
    const billingData: Data = {
        ...data,
        gpuBilling: [
            {
                month: "2026-06",
                vendor: "runpod",
                deployment: "zimage-4090-secure",
                gpu: "RTX 4090",
                amount: 750,
                currency: "USD",
                source: "api",
            },
            {
                month: "2026-06",
                vendor: "runpod",
                deployment: "klein-a5000-v4",
                gpu: "RTX A5000",
                amount: 250,
                currency: "USD",
                source: "api",
            },
        ],
    };

    it("billing rows beat fleet when both exist", () => {
        const rows = gpuEconomics(billingData, "2026-06");
        const runpodRows = rows.filter((r) => r.vendor === "runpod");
        expect(runpodRows.length).toBeGreaterThan(0);
        expect(runpodRows.every((r) => r.flags.includes("split: billed"))).toBe(
            true,
        );
        expect(
            runpodRows.every((r) => !r.flags.includes("split: fleet $/hr")),
        ).toBe(true);
    });

    it("grouped rents scale to provider bill with billing weights", () => {
        const rows = gpuEconomics(billingData, "2026-06");
        const total = rows
            .filter((r) => r.vendor === "runpod")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(1000, 2);
        const zimage = rows.find((r) => r.models.includes("zimage"));
        expect(zimage?.rentUsd).toBeCloseTo(750, 2);
    });

    it("unresolved podId row flagged 'unmapped billing id'", () => {
        const withPodId: Data = {
            ...billingData,
            gpuBilling: [
                ...billingData.gpuBilling,
                {
                    month: "2026-06",
                    vendor: "runpod",
                    deployment: "hsl3ksl31lvrcc",
                    gpu: "",
                    amount: 56.74,
                    currency: "USD",
                    source: "api",
                },
            ],
        };
        const rows = gpuEconomics(withPodId, "2026-06");
        const podRow = rows.find((r) => r.group === "hsl3ksl31lvrcc");
        expect(podRow).toBeDefined();
        expect(podRow?.flags).toContain("unmapped billing id");
    });

    it("drift flag fires at >2% difference, not at <2%", () => {
        // billing sum = 975, provider bill = 1000 → 2.5% drift → flag fires
        const driftData: Data = {
            ...billingData,
            gpuBilling: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    deployment: "zimage-4090-secure",
                    gpu: "RTX 4090",
                    amount: 725,
                    currency: "USD",
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    deployment: "klein-a5000-v4",
                    gpu: "RTX A5000",
                    amount: 250,
                    currency: "USD",
                    source: "api",
                },
            ],
        };
        const rows = gpuEconomics(driftData, "2026-06");
        const runpodRows = rows.filter((r) => r.vendor === "runpod");
        expect(
            runpodRows.some((r) =>
                r.flags.some((f) => f.startsWith("billing drift")),
            ),
        ).toBe(true);

        // billing sum = 985, provider bill = 1000 → 1.5% → no drift flag
        const noDriftData: Data = {
            ...billingData,
            gpuBilling: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    deployment: "zimage-4090-secure",
                    gpu: "RTX 4090",
                    amount: 735,
                    currency: "USD",
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    deployment: "klein-a5000-v4",
                    gpu: "RTX A5000",
                    amount: 250,
                    currency: "USD",
                    source: "api",
                },
            ],
        };
        const noDriftRows = gpuEconomics(noDriftData, "2026-06");
        const noDriftRunpod = noDriftRows.filter((r) => r.vendor === "runpod");
        expect(
            noDriftRunpod.every(
                (r) => !r.flags.some((f) => f.startsWith("billing drift")),
            ),
        ).toBe(true);
    });

    it("manual and cli sources accepted same as api", () => {
        const manualData: Data = {
            ...base,
            gpuBilling: [
                {
                    month: "2026-06",
                    vendor: "lambda",
                    deployment: "Sana - LTX-2.3 - AceStep",
                    gpu: "1x GH200 (96 GB)",
                    amount: 500,
                    currency: "USD",
                    source: "manual",
                },
            ],
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "lambda",
                    currency: "USD",
                    category: "compute",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
            ],
            pollenMonthly: [],
            revenueMonthly: [],
            gpuFleet: [],
        };
        const rows = gpuEconomics(manualData, "2026-06");
        const lambdaRows = rows.filter((r) => r.vendor === "lambda");
        expect(lambdaRows.length).toBeGreaterThan(0);
        expect(lambdaRows.every((r) => r.flags.includes("split: billed"))).toBe(
            true,
        );
    });

    it("fleet $/hr used when no billing rows", () => {
        const fleetOnlyData: Data = { ...data, gpuBilling: [] };
        const rows = gpuEconomics(fleetOnlyData, "2026-06");
        const runpodRows = rows.filter((r) => r.vendor === "runpod");
        expect(
            runpodRows.every((r) => r.flags.includes("split: fleet $/hr")),
        ).toBe(true);
    });
});
