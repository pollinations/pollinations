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

    it("multi-month no-fleet vendor: cross-month rent does not leak (ovhcloud)", () => {
        // ovhcloud has no fleet — emits one vendor-total row per month.
        // With bills in two months, each month row must carry only its own bill.
        const d: Data = {
            ...base,
            gpuFleet: [],
            providerMonthly: [
                {
                    month: "2026-05",
                    vendor: "ovhcloud",
                    currency: "USD",
                    category: "compute",
                    credit: 150,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "ovhcloud",
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
            (r) => r.vendor === "ovhcloud" && r.month === "2026-05",
        );
        const juneRow = rows.find(
            (r) => r.vendor === "ovhcloud" && r.month === "2026-06",
        );
        expect(mayRow?.rentUsd).toBeCloseTo(150, 6);
        expect(juneRow?.rentUsd).toBeCloseTo(250, 6);
        const grandTotal = rows
            .filter((r) => r.vendor === "ovhcloud")
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
