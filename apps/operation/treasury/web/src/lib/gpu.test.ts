import { describe, expect, it } from "vitest";
import type { Data, GpuRunRow, PollenMonthlyRow } from "../types";
import { gpuByType, gpuEconomics } from "./gpu";

const base: Data = {
    transactions: [],
    providerMonthly: [],
    pollenMonthly: [],
    grants: [],
    runs: [],
    revenueMonthly: [],
    gpuRuns: [],
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
    "error: unmapped model - assign the deployment in the GPU run source";
const ZERO_COST_FLAG = "error: gpu runs have zero cost — cannot split bill";

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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute-gpu",
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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
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
                    category: "compute-gpu",
                    credit: 100,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute-gpu",
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

    it("dust: rentUsd under $5 always gets null verdict, even when coverage would otherwise be 'keep'", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute-gpu",
                    credit: 3,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "alpha",
                    cost: 3,
                }),
            ],
            pollenMonthly: [
                mkPollen({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "alpha",
                    requests: 1000,
                    price_paid: 1000, // retained 1000 → coverage ~316 (would be "keep")
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const alpha = rows.find((r) => r.group === "alpha");
        expect(alpha).toBeDefined();
        expect(alpha?.rentUsd).toBeCloseTo(3, 4);
        expect(alpha?.coverage ?? 0).toBeGreaterThan(1.1); // would-be "keep"
        expect(alpha?.verdict).toBeNull();
    });

    it("effUsdPerReq equals rentUsd / requests for a billed model with nonzero requests", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "runpod",
                    currency: "USD",
                    category: "compute-gpu",
                    credit: 750,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "beta",
                    cost: 750,
                }),
            ],
            pollenMonthly: [
                mkPollen({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "beta",
                    requests: 400000,
                    price_paid: 5000,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const beta = rows.find((r) => r.group === "beta");
        expect(beta?.rentUsd).toBeCloseTo(750, 4);
        expect(beta?.requests).toBe(400000);
        expect(beta?.effUsdPerReq).toBeCloseTo(750 / 400000, 6);
    });
});

describe("gpuEconomics — zero-cost runs", () => {
    it("a bill with all-zero-cost runs → one (vendor total) error row, rentUsd == bill, no NaN", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "lambda",
                    currency: "USD",
                    category: "compute-gpu",
                    credit: 200,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "lambda",
                    month: "2026-06",
                    model: "gamma",
                    cost: 0,
                    run_id: "lambda-1",
                }),
                mkRun({
                    vendor: "lambda",
                    month: "2026-06",
                    model: "gamma",
                    cost: 0,
                    run_id: "lambda-2",
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const lambdaRows = rows.filter((r) => r.vendor === "lambda");
        expect(lambdaRows).toHaveLength(1);
        expect(lambdaRows[0].group).toBe("(lambda total)");
        expect(lambdaRows[0].flags).toContain(ZERO_COST_FLAG);
        expect(lambdaRows[0].rentUsd).toBeCloseTo(200, 4);
        expect(Number.isNaN(lambdaRows[0].rentUsd)).toBe(false);
        expect(Number.isNaN(lambdaRows[0].coverage ?? 0)).toBe(false);
    });
});

describe("gpuEconomics — vendor scope (compute-gpu witness)", () => {
    it("a vendor whose only provider row is plain `compute` (not compute-gpu) and has no runs is not iterated", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "openai",
                    currency: "USD",
                    category: "compute",
                    credit: 500,
                    paid: 0,
                    source: "api",
                },
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const econRows = gpuEconomics(d, "2026-06");
        expect(econRows.some((r) => r.vendor === "openai")).toBe(false);
    });

    it("a compute-gpu provider row is witnessed (lambda, no runs → (lambda total) + NO_RUNS_FLAG)", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "lambda",
                    currency: "USD",
                    category: "compute-gpu",
                    credit: 150,
                    paid: 0,
                    source: "api",
                },
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const econRows = gpuEconomics(d, "2026-06");
        const lambdaRow = econRows.find((r) => r.vendor === "lambda");
        expect(lambdaRow).toBeDefined();
        expect(lambdaRow?.group).toBe("(lambda total)");
        expect(lambdaRow?.flags).toContain(NO_RUNS_FLAG);
        expect(lambdaRow?.rentUsd).toBeCloseTo(150, 4);
    });

    it("OVH (mixed bill) contributes only its compute-gpu slice; inference + infra rows are ignored; gpuByType is unaffected", () => {
        const d: Data = {
            ...base,
            providerMonthly: [
                {
                    month: "2026-06",
                    vendor: "ovhcloud",
                    currency: "USD",
                    category: "compute-gpu",
                    credit: 1856.8,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "ovhcloud",
                    currency: "USD",
                    category: "compute",
                    credit: 962,
                    paid: 0,
                    source: "api",
                },
                {
                    month: "2026-06",
                    vendor: "ovhcloud",
                    currency: "USD",
                    category: "infra",
                    credit: 59,
                    paid: 0,
                    source: "api",
                },
            ],
            gpuRuns: [
                mkRun({
                    vendor: "ovhcloud",
                    month: "2026-06",
                    model: "",
                    gpu: "RTX 4090",
                    hours: 5,
                    cost: 40,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };

        const econRows = gpuEconomics(d, "2026-06");
        const ovhRows = econRows.filter((r) => r.vendor === "ovhcloud");
        expect(ovhRows.length).toBeGreaterThan(0);
        expect(ovhRows.every((r) => r.group === "(unmapped)")).toBe(true);
        expect(ovhRows.some((r) => r.flags.includes(UNMAPPED_FLAG))).toBe(true);
        const totalRent = ovhRows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(totalRent).toBe(1856.8); // not 1856.80+962+59

        const typeRows = gpuByType(d, "2026-06");
        const ovhType = typeRows.find((r) => r.vendor === "ovhcloud");
        expect(ovhType).toBeDefined();
        expect(ovhType?.gpu).toBe("RTX 4090");
        expect(ovhType?.costUsd).toBeCloseTo(40, 4);
    });

    it("a vendor with runs but no compute-gpu provider row surfaces null rent + NO_BILL_FLAG", () => {
        const d: Data = {
            ...base,
            gpuRuns: [
                mkRun({
                    vendor: "runpod",
                    month: "2026-06",
                    model: "zimage",
                    cost: 40,
                }),
            ],
            revenueMonthly: REVENUE_JUNE,
        };
        const rows = gpuEconomics(d, "2026-06");
        const zimage = rows.find((r) => r.group === "zimage");
        expect(zimage).toBeDefined();
        expect(zimage?.rentUsd).toBeNull();
        expect(zimage?.flags).toContain(NO_BILL_FLAG);
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
