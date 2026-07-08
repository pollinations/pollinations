import { describe, expect, it } from "vitest";
import type { Data, GpuRunRow, PollenMonthlyRow } from "../types";
import { fleetRunRate, gpuByType, gpuEconomics, runwayChips } from "./gpu";

const base: Data = {
    transactions: [],
    providerMonthly: [],
    pollenMonthly: [],
    grants: [],
    runs: [],
    revenueMonthly: [],
    gpuFleet: [],
    gpuBilling: [],
    gpuRuns: [],
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

// Kept only for fleetRunRate / runwayChips (fleet witness stays live until
// Task 13). gpuEconomics no longer reads gpuFleet.
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

// ---- fixture helpers -----------------------------------------------------

function mkRun(o: {
    vendor: string;
    month: string;
    cost: number;
    model: string;
    gpu?: string;
    hours?: number | null;
    currency?: string;
    kind?: string;
    run_id?: string;
}): GpuRunRow {
    return {
        month: o.month,
        vendor: o.vendor,
        run_id: o.run_id ?? `${o.vendor}-${o.month}-${o.model}-${o.cost}`,
        deployment: "dep",
        gpu: o.gpu ?? "",
        gpu_count: 1,
        started_at: "",
        ended_at: "",
        hours: o.hours === undefined ? null : o.hours,
        cost: o.cost,
        currency: o.currency ?? "USD",
        model: o.model,
        kind: o.kind ?? "gpu",
        source: "api",
    };
}

function mkPollen(o: {
    vendor: string;
    month: string;
    model: string;
    requests?: number;
    price_paid?: number;
    price_quests?: number;
    byop_paid?: number;
    model_paid?: number;
}): PollenMonthlyRow {
    return {
        source: "tinybird",
        month: o.month,
        vendor: o.vendor,
        model: o.model,
        currency: "POLLEN",
        cost_paid: 0,
        cost_quests: 0,
        price_paid: o.price_paid ?? 0,
        price_quests: o.price_quests ?? 0,
        byop_paid: o.byop_paid ?? 0,
        byop_quests: 0,
        model_paid: o.model_paid ?? 0,
        model_quests: 0,
        requests: o.requests ?? 0,
    };
}

const REVENUE_JUNE: Data["revenueMonthly"] = [
    {
        source: "stripe",
        month: "2026-06",
        currency: "USD",
        gross_amount: 10000,
        fees_amount: 500,
        refunds_amount: 0,
    },
];

const NO_BILL_FLAG = "error: no provider bill this month — rent unwitnessed";
const NO_RUNS_FLAG =
    "error: no gpu runs this month — deployment split unavailable";
const UNMAPPED_FLAG =
    "error: unmapped model — assign the deployment in forager config/gpu_models.json";

// ---- gpuEconomics --------------------------------------------------------

describe("gpuEconomics — bill allocation invariant", () => {
    it("Σ rentUsd == the provider bill exactly with 3+ models (remainder-to-last)", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 1000,
                    paid: 0,
                    source: "api",
                },
            ],
            // three single-model runs, $100 each → runLedgerTotal 300, bill 1000
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "alpha",
                    cost: 100,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "beta",
                    cost: 100,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "gamma",
                    cost: 100,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const runpod = rows.filter((r) => r.vendor === "runpod");
        expect(runpod).toHaveLength(3);
        const total = runpod.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(1000, 4); // never against runLedgerTotal
    });

    it("splits a multi-model run by pollen request share and sums to the bill", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "flux,zimage",
                    cost: 100,
                }),
            ],
            pollenMonthly: [
                mkPollen({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "flux",
                    requests: 90000,
                }),
                mkPollen({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "zimage",
                    requests: 10000,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const flux = rows.find((r) => r.group === "flux");
        const zimage = rows.find((r) => r.group === "zimage");
        expect(flux?.rentUsd).toBeCloseTo(90, 4); // 90k / 100k share
        expect(zimage?.rentUsd).toBeCloseTo(10, 4); // 10k / 100k share
        const total = rows
            .filter((r) => r.vendor === "runpod")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(100, 4);
    });

    it("even-splits a multi-model run when there is no pollen to weight it", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "a,b",
                    cost: 100,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const a = rows.find((r) => r.group === "a");
        const b = rows.find((r) => r.group === "b");
        expect(a?.rentUsd).toBeCloseTo(50, 4);
        expect(b?.rentUsd).toBeCloseTo(50, 4);
    });

    it("flags run-ledger vs bill drift on the max-rent row only, still Σ==bill", () => {
        // runLedgerTotal 975 vs bill 1000 → 2.5% drift
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 1000,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "big",
                    cost: 700,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "small",
                    cost: 275,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const drifted = rows.filter((r) =>
            r.flags.some((f) => f.startsWith("gpu runs vs bill drift")),
        );
        expect(drifted).toHaveLength(1);
        expect(drifted[0].group).toBe("big"); // largest rentShare
        expect(drifted[0].flags).toContain("gpu runs vs bill drift: $25");
        const total = rows
            .filter((r) => r.vendor === "runpod")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(1000, 4);
    });
});

describe("gpuEconomics — no-fallback error states", () => {
    it("run-only month with no provider bill → null rent + explicit error, null coverage", () => {
        const d: Data = {
            ...base,
            providerMonthly: [],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "flux",
                    cost: 50,
                }),
            ],
            pollenMonthly: [
                mkPollen({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "flux",
                    requests: 5000,
                    price_paid: 100,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.rentUsd).toBeNull();
            expect(row.coverage).toBeNull();
            expect(row.flags).toContain(NO_BILL_FLAG);
        }
    });

    it("bill-only month (vendor has runs elsewhere) → one (vendor total) error row", () => {
        // runpod: May bill, no runs; June bill + runs. Filter the year.
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-05",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 300,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "flux",
                    cost: 300,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026");
        const mayRow = rows.find(
            (r) => r.vendor === "runpod" && r.month === "2026-05",
        );
        expect(mayRow).toBeDefined();
        expect(mayRow?.group).toBe("(runpod total)");
        expect(mayRow?.rentUsd).toBeCloseTo(500, 4);
        expect(mayRow?.flags).toContain(NO_RUNS_FLAG);
    });

    it("unmapped model (empty model column) → (unmapped) row with explicit error", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "",
                    cost: 100,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const unmapped = rows.find((r) => r.group === "(unmapped)");
        expect(unmapped).toBeDefined();
        expect(unmapped?.rentUsd).toBeCloseTo(100, 4);
        expect(unmapped?.flags).toContain(UNMAPPED_FLAG);
    });
});

describe("gpuEconomics — verdict + isolation", () => {
    it("serverless model with sub-0.4 coverage gets 'raise?', never 'idle-candidate'", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "modal",
                    currency: "USD",
                    category: "compute",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "modal",
                    month: "2026-06",
                    model: "klein",
                    cost: 100,
                    kind: "serverless",
                }),
            ],
            pollenMonthly: [
                mkPollen({
                    vendor: "modal",
                    month: "2026-06",
                    model: "klein",
                    requests: 1000,
                    price_paid: 1, // retained 1 → coverage ≈ 0.0095 < 0.4
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const klein = rows.find((r) => r.group === "klein");
        expect(klein?.kind).toBe("serverless");
        expect(klein?.verdict).toBe("raise?");
        expect(klein?.verdict).not.toBe("idle-candidate");
    });

    it("multi-month year filter: each month's Σ rentUsd pins to its own bill", () => {
        const d: Data = {
            ...base,
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
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-05",
                    model: "alpha",
                    cost: 40,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-05",
                    model: "beta",
                    cost: 60,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "alpha",
                    cost: 120,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "beta",
                    cost: 80,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026");
        const mayTotal = rows
            .filter((r) => r.month === "2026-05")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        const juneTotal = rows
            .filter((r) => r.month === "2026-06")
            .reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(mayTotal).toBeCloseTo(100, 4);
        expect(juneTotal).toBeCloseTo(200, 4);
        expect(mayTotal + juneTotal).toBeCloseTo(300, 4);
    });
});

// ---- gpuByType -----------------------------------------------------------

describe("gpuByType", () => {
    it("aggregates per (vendor, gpu, month), sums cost incl. null-hours runs, flags unknown hours", () => {
        const d: Data = {
            ...base,
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "zimage",
                    gpu: "RTX 4090",
                    hours: 10,
                    cost: 20,
                }),
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "zimage",
                    gpu: "RTX 4090",
                    hours: null,
                    cost: 5,
                }),
                mkRun({
                    vendor: "vast.ai",
                    month: "2026-06",
                    model: "flux",
                    gpu: "RTX 4090",
                    hours: 8,
                    cost: 16,
                }),
            ],
        };
        const rows = gpuByType(d, "2026-06");
        const runpod = rows.find(
            (r) => r.vendor === "runpod" && r.gpu === "RTX 4090",
        );
        const vast = rows.find(
            (r) => r.vendor === "vast.ai" && r.gpu === "RTX 4090",
        );
        // same gpu across two vendors stays split by vendor
        expect(runpod).toBeDefined();
        expect(vast).toBeDefined();
        // hours = Σ non-null; cost includes the null-hours run
        expect(runpod?.hours).toBe(10);
        expect(runpod?.costUsd).toBeCloseTo(25, 4);
        expect(runpod?.impliedUsdPerHr).toBeCloseTo(2.5, 4); // 25 / 10
        expect(runpod?.flags).toContain("hours unknown");
        expect(runpod?.models).toEqual(["zimage"]);
        // vast group is complete-hours → no flag
        expect(vast?.hours).toBe(8);
        expect(vast?.impliedUsdPerHr).toBeCloseTo(2, 4);
        expect(vast?.flags).not.toContain("hours unknown");
        // sorted by costUsd desc
        expect(rows[0].costUsd).toBeGreaterThanOrEqual(rows[1].costUsd);
    });

    it("empty gpu → 'unknown GPU'; all-null-hours group → hours null, no implied rate", () => {
        const d: Data = {
            ...base,
            gpuRuns: [
                mkRun({
                    vendor: "modal",
                    month: "2026-06",
                    model: "klein",
                    gpu: "",
                    hours: null,
                    cost: 3,
                }),
            ],
        };
        const rows = gpuByType(d, "2026-06");
        expect(rows).toHaveLength(1);
        expect(rows[0].gpu).toBe("unknown GPU");
        expect(rows[0].hours).toBeNull();
        expect(rows[0].impliedUsdPerHr).toBeNull();
        expect(rows[0].flags).toContain("hours unknown");
    });
});

// ---- untouched fleet helpers (fleet witness stays live until Task 13) -----

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
