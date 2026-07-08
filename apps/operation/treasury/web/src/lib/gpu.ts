import type { Data, GpuFleetRow } from "../types";
import { toUsd } from "./fx";
import { creditRunway, globalNetRatio, isInfraRow } from "./insights";
import { matchesMonth } from "./months";

// kind: "gpu" = rented box (idle risk, time-based); "serverless" = scales to
// zero (per-run billing inside the same vendor bill). It only drives the
// verdict (serverless never "idle-candidate") and a row chip. The kind now
// rides on each run (data.gpuRuns.kind, stamped from forager
// config/gpu_models.json); a model is "serverless" only when EVERY run that
// served it was serverless.
export type DeploymentKind = "gpu" | "serverless";

// Registry unit prices for break-even (shared/registry/image.ts; hardcoded —
// no registry ingestion this phase, PLAN-INSIGHTS ruling).
export const REGISTRY_UNIT_PRICES: Record<
    string,
    { price: number; unit: string }
> = {
    zimage: { price: 0.002, unit: "img" },
    klein: { price: 0.01, unit: "img" },
    "ltx-2": { price: 0.005, unit: "s" },
};

export type GpuDeploymentRow = {
    group: string; // model name, or "(unmapped)" / "(vendor total)"
    vendor: string;
    month: string;
    rentUsd: number | null; // null = no provider bill witnessed that month
    models: string[];
    requests: number;
    paidUsd: number; // Σ price_paid over the model's pollen rows
    questUsd: number; // Σ price_quests
    retainedUsd: number; // Σ (price_paid − byop_paid − model_paid)
    coverage: number | null; // retained × netRatio ÷ rent
    effUsdPerReq: number | null;
    breakEven: { model: string; unit: string; volume: number }[];
    verdict: "keep" | "raise?" | "idle-candidate" | null;
    flags: string[];
    kind: DeploymentKind;
};

// Per-GPU-type aggregation (additive; Task 11's per-GPU table consumes it).
export type GpuTypeRow = {
    vendor: string;
    gpu: string; // "RTX 4090"; "" → "unknown GPU"
    month: string;
    hours: number | null; // Σ non-null run hours; null if ALL runs null-hours
    costUsd: number; // Σ toUsd(run.cost)
    impliedUsdPerHr: number | null; // costUsd / hours; null when hours null/0
    models: string[]; // distinct models across the group's runs (CSV-split)
    flags: string[]; // "hours unknown" if any run had null hours
};

export type RunwayChip = {
    vendor: string;
    label: string;
    days: number | null;
    tone: "danger" | "warning" | "neutral";
};

const UNMAPPED = "(unmapped)";
const NO_BILL_FLAG = "error: no provider bill this month — rent unwitnessed";
const NO_RUNS_FLAG =
    "error: no gpu runs this month — deployment split unavailable";
const ZERO_COST_FLAG = "error: gpu runs have zero cost — cannot split bill";
const UNMAPPED_FLAG =
    "error: unmapped model — assign the deployment in forager config/gpu_models.json";

// Split a comma-joined model column into trimmed, non-empty model names.
function splitModels(model: string): string[] {
    return model
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
}

// Group the fleet rows by vendor, keeping only the most recent snapshot per
// vendor (all rows with recorded_at equal to that vendor's maximum).
function latestFleet(rows: GpuFleetRow[]): GpuFleetRow[] {
    const maxAt = new Map<string, string>();
    for (const row of rows) {
        const cur = maxAt.get(row.vendor);
        if (!cur || row.recorded_at > cur)
            maxAt.set(row.vendor, row.recorded_at);
    }
    return rows.filter((row) => row.recorded_at === maxAt.get(row.vendor));
}

// Σ usd_per_hr across the latest fleet snapshot. null when no fleet rows.
export function fleetRunRate(
    data: Data,
): { usdPerHr: number; usdPerMonth: number } | null {
    const latest = latestFleet(data.gpuFleet);
    if (latest.length === 0) return null;
    const usdPerHr = latest.reduce((acc, r) => acc + r.usd_per_hr, 0);
    return { usdPerHr, usdPerMonth: usdPerHr * 730 };
}

// Derive per-model GPU economics from data.gpuRuns. The provider bill is the
// rent witness; run costs are only allocation weights.
//
// Per vendor (vendors present in gpuRuns for the filter), per month (union of
// bill-months and run-months):
//   1. Expand runs → per-model cost. A run's cost is split across the models
//      its box serves by each model's pollen request share (even split when no
//      pollen), remainder-to-last so Σ splits == run cost exactly.
//   2. Allocate the WITNESSED provider bill across models by their run-cost
//      weight, remainder-to-last so Σ rentUsd == the bill EXACTLY. The bill is
//      never derived from the run ledger — a missing bill is null + an error,
//      never the run-ledger total substituted in.
export function gpuEconomics(
    data: Data,
    monthFilter: string,
): GpuDeploymentRow[] {
    const netRatio = globalNetRatio(data.revenueMonthly);
    const result: GpuDeploymentRow[] = [];

    const runsInScope = data.gpuRuns.filter((r) =>
        matchesMonth(r.month, monthFilter),
    );
    const vendors = [...new Set(runsInScope.map((r) => r.vendor))].sort();

    for (const vendor of vendors) {
        // Rent witness: month → Σ toUsd(credit+paid) over compute provider rows.
        const rentByMonth = new Map<string, number>();
        for (const r of data.providerMonthly) {
            if (r.vendor !== vendor) continue;
            if (!matchesMonth(r.month, monthFilter)) continue;
            if (isInfraRow(r)) continue;
            rentByMonth.set(
                r.month,
                (rentByMonth.get(r.month) ?? 0) +
                    toUsd(r.credit + r.paid, r.currency, r.month),
            );
        }

        const vendorRuns = runsInScope.filter((r) => r.vendor === vendor);
        const runMonths = new Set(vendorRuns.map((r) => r.month));
        const months = [
            ...new Set([...rentByMonth.keys(), ...runMonths]),
        ].sort();

        const vendorKind: DeploymentKind =
            vendor === "modal" ? "serverless" : "gpu";

        for (const month of months) {
            const vendorRentUsd = rentByMonth.get(month) ?? null;
            const monthRuns = vendorRuns.filter((r) => r.month === month);
            const monthPollen = data.pollenMonthly.filter(
                (r) => r.vendor === vendor && r.month === month,
            );

            // Vendor-total error row: a bill exists but the split cannot be done
            // (no runs, or every run has zero cost). Never fabricates a split.
            const emitVendorTotal = (flag: string) => {
                const { requests, paidUsd, questUsd, retainedUsd } =
                    aggregatePollen(monthPollen, month);
                const models = [...new Set(monthPollen.map((r) => r.model))];
                const coverage = computeCoverage(
                    retainedUsd,
                    netRatio,
                    vendorRentUsd,
                );
                result.push({
                    group: `(${vendor} total)`,
                    vendor,
                    month,
                    rentUsd: vendorRentUsd,
                    models,
                    requests,
                    paidUsd,
                    questUsd,
                    retainedUsd,
                    coverage,
                    effUsdPerReq:
                        vendorRentUsd != null && requests > 0
                            ? vendorRentUsd / requests
                            : null,
                    breakEven: computeBreakEven(
                        models,
                        vendorRentUsd,
                        netRatio,
                    ),
                    verdict: verdictFor(coverage, vendorKind),
                    flags: [flag],
                    kind: vendorKind,
                });
            };

            if (monthRuns.length === 0) {
                // Bill-only month for a runs-vendor. vendorRentUsd is non-null
                // here (month came from rentByMonth).
                emitVendorTotal(NO_RUNS_FLAG);
                continue;
            }

            // Request weight per model for the multi-model split.
            const reqByModel = new Map<string, number>();
            for (const r of monthPollen) {
                reqByModel.set(
                    r.model,
                    (reqByModel.get(r.model) ?? 0) + r.requests,
                );
            }

            // Expand runs → per-model cost + kind.
            const modelCost = new Map<string, number>();
            const modelKind = new Map<string, Set<string>>();
            let runLedgerTotal = 0;
            for (const run of monthRuns) {
                const costUsd = toUsd(run.cost, run.currency, month);
                runLedgerTotal += costUsd;
                const runModels = splitModels(run.model);
                const models = runModels.length > 0 ? runModels : [UNMAPPED];

                // Split costUsd across models by request share, remainder-to-last
                // so Σ contributions == costUsd exactly to the cent.
                const weights = models.map((m) => reqByModel.get(m) ?? 0);
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let assigned = 0;
                for (let i = 0; i < models.length; i++) {
                    const contribution =
                        i === models.length - 1
                            ? costUsd - assigned
                            : totalWeight > 0
                              ? costUsd * (weights[i] / totalWeight)
                              : costUsd / models.length;
                    assigned += contribution;
                    modelCost.set(
                        models[i],
                        (modelCost.get(models[i]) ?? 0) + contribution,
                    );
                    const kinds = modelKind.get(models[i]) ?? new Set<string>();
                    kinds.add(run.kind);
                    modelKind.set(models[i], kinds);
                }
            }

            if (vendorRentUsd != null && runLedgerTotal === 0) {
                // Bill exists but nothing to weight it by.
                emitVendorTotal(ZERO_COST_FLAG);
                continue;
            }

            // Allocate the bill across models by run-cost weight, remainder-to-
            // last so Σ rentShare == vendorRentUsd EXACTLY.
            const models = [...modelCost.keys()].sort();
            const rentShare = new Map<string, number | null>();
            if (vendorRentUsd != null && runLedgerTotal > 0) {
                let assigned = 0;
                for (let i = 0; i < models.length; i++) {
                    const share =
                        i === models.length - 1
                            ? vendorRentUsd - assigned
                            : vendorRentUsd *
                              ((modelCost.get(models[i]) ?? 0) /
                                  runLedgerTotal);
                    assigned += share;
                    rentShare.set(models[i], share);
                }
            } else {
                // Run-only month (no witnessed bill): rent is unknown, not zero.
                for (const m of models) rentShare.set(m, null);
            }

            // Drift: run ledger diverges from the witnessed bill by >2%. It is a
            // vendor-month fact → attach only to the max-rent row (tie: model asc).
            let driftFlag: string | null = null;
            if (
                vendorRentUsd != null &&
                vendorRentUsd > 0 &&
                Math.abs(runLedgerTotal - vendorRentUsd) / vendorRentUsd > 0.02
            ) {
                driftFlag = `gpu runs vs bill drift: $${Math.round(
                    Math.abs(runLedgerTotal - vendorRentUsd),
                )}`;
            }
            let maxRentIdx = -1;
            let maxRent = -Infinity;
            for (let i = 0; i < models.length; i++) {
                const share = rentShare.get(models[i]) ?? 0;
                if (share > maxRent) {
                    maxRent = share;
                    maxRentIdx = i;
                }
            }

            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                const share = rentShare.get(model) ?? null;
                const kinds = modelKind.get(model) ?? new Set<string>();
                const kind: DeploymentKind =
                    kinds.size === 1 && kinds.has("serverless")
                        ? "serverless"
                        : "gpu";

                const pollenRows = monthPollen.filter((r) => r.model === model);
                const { requests, paidUsd, questUsd, retainedUsd } =
                    aggregatePollen(pollenRows, month);

                const coverage = computeCoverage(retainedUsd, netRatio, share);
                const baseVerdict = verdictFor(coverage, kind);

                const flags: string[] = [];
                if (model === UNMAPPED) flags.push(UNMAPPED_FLAG);
                if (vendorRentUsd == null) flags.push(NO_BILL_FLAG);
                if (driftFlag && i === maxRentIdx) flags.push(driftFlag);

                result.push({
                    group: model,
                    vendor,
                    month,
                    rentUsd: share,
                    models: [model],
                    requests,
                    paidUsd,
                    questUsd,
                    retainedUsd,
                    coverage,
                    effUsdPerReq:
                        share != null && requests > 0 ? share / requests : null,
                    breakEven: computeBreakEven([model], share, netRatio),
                    // Dust: a sub-$5 rent is noise — no verdict.
                    verdict: share != null && share < 5 ? null : baseVerdict,
                    flags,
                    kind,
                });
            }
        }
    }

    return result;
}

// Per-GPU-type aggregation over data.gpuRuns, grouped by (vendor, gpu, month).
export function gpuByType(data: Data, monthFilter: string): GpuTypeRow[] {
    type Acc = {
        vendor: string;
        gpu: string;
        month: string;
        hoursSum: number;
        hasHours: boolean;
        anyNullHours: boolean;
        costUsd: number;
        models: Set<string>;
    };
    const groups = new Map<string, Acc>();
    for (const run of data.gpuRuns) {
        if (!matchesMonth(run.month, monthFilter)) continue;
        const gpu = run.gpu || "unknown GPU";
        const key = `${run.vendor}|${gpu}|${run.month}`;
        const acc = groups.get(key) ?? {
            vendor: run.vendor,
            gpu,
            month: run.month,
            hoursSum: 0,
            hasHours: false,
            anyNullHours: false,
            costUsd: 0,
            models: new Set<string>(),
        };
        acc.costUsd += toUsd(run.cost, run.currency, run.month);
        if (run.hours == null) {
            acc.anyNullHours = true;
        } else {
            acc.hoursSum += run.hours;
            acc.hasHours = true;
        }
        for (const m of splitModels(run.model)) acc.models.add(m);
        groups.set(key, acc);
    }

    return [...groups.values()]
        .map((acc): GpuTypeRow => {
            const hours = acc.hasHours ? acc.hoursSum : null;
            return {
                vendor: acc.vendor,
                gpu: acc.gpu,
                month: acc.month,
                hours,
                costUsd: acc.costUsd,
                impliedUsdPerHr:
                    hours != null && hours > 0 ? acc.costUsd / hours : null,
                models: [...acc.models].sort(),
                flags: acc.anyNullHours ? ["hours unknown"] : [],
            };
        })
        .sort(
            (a, b) =>
                b.costUsd - a.costUsd ||
                a.vendor.localeCompare(b.vendor) ||
                a.gpu.localeCompare(b.gpu) ||
                a.month.localeCompare(b.month),
        );
}

// Aggregate pollen metrics over a set of matching rows.
function aggregatePollen(
    rows: {
        price_paid: number;
        price_quests: number;
        byop_paid: number;
        model_paid: number;
        requests: number;
        currency: string;
        month: string;
    }[],
    month: string,
): {
    requests: number;
    paidUsd: number;
    questUsd: number;
    retainedUsd: number;
} {
    let requests = 0;
    let paidUsd = 0;
    let questUsd = 0;
    let retainedUsd = 0;
    for (const r of rows) {
        requests += r.requests;
        paidUsd += toUsd(r.price_paid, r.currency, month);
        questUsd += toUsd(r.price_quests, r.currency, month);
        retainedUsd += toUsd(
            r.price_paid - r.byop_paid - r.model_paid,
            r.currency,
            month,
        );
    }
    return { requests, paidUsd, questUsd, retainedUsd };
}

// coverage = (retained × netRatio) / rent
// null when rent is null/zero OR netRatio is null.
function computeCoverage(
    retainedUsd: number,
    netRatio: number | null,
    rentUsd: number | null,
): number | null {
    if (rentUsd == null || rentUsd === 0 || netRatio == null) return null;
    return (retainedUsd * netRatio) / rentUsd;
}

// Break-even volumes for models that have a known registry price and a rent.
function computeBreakEven(
    models: string[],
    rentUsd: number | null,
    netRatio: number | null,
): { model: string; unit: string; volume: number }[] {
    if (rentUsd == null || netRatio == null || netRatio === 0) return [];
    const result: { model: string; unit: string; volume: number }[] = [];
    for (const model of models) {
        const entry = REGISTRY_UNIT_PRICES[model];
        if (!entry) continue;
        result.push({
            model,
            unit: entry.unit,
            volume: rentUsd / (entry.price * netRatio),
        });
    }
    return result;
}

// Verdict rule:
// - null when coverage is null (not enough signal)
// - "idle-candidate" when coverage < 0.4 AND kind is "gpu" (serverless scales to zero already)
// - "raise?" when coverage < 0.4 AND kind is "serverless", or coverage < 1.1
// - "keep" otherwise
function verdictFor(
    coverage: number | null,
    kind: DeploymentKind,
): "keep" | "raise?" | "idle-candidate" | null {
    if (coverage == null) return null;
    if (coverage < 0.4) {
        return kind === "serverless" ? "raise?" : "idle-candidate";
    }
    if (coverage < 1.1) return "raise?";
    return "keep";
}

// Runway chips for the fleet health panel.
// runpod / vast.ai: latest fleet balance_usd ÷ (Σ usd_per_hr × 24) → days.
// lambda: reuse creditRunway() depletion signal.
export function runwayChips(data: Data, now: Date): RunwayChip[] {
    const chips: RunwayChip[] = [];

    // Balance-based chips (runpod, vast.ai)
    const balanceVendors = ["runpod", "vast.ai"] as const;
    for (const vendor of balanceVendors) {
        const latest = latestFleet(data.gpuFleet).filter(
            (r) => r.vendor === vendor,
        );
        if (latest.length === 0) continue;

        const totalRatePerHr = latest.reduce((acc, r) => acc + r.usd_per_hr, 0);
        // balance_usd is a vendor-level value repeated on every fleet row of the
        // same snapshot — take it from the first row, never sum across rows.
        const balance = latest[0].balance_usd ?? 0;

        const dailyBurn = totalRatePerHr * 24;
        const days = dailyBurn > 0 ? balance / dailyBurn : null;
        chips.push({
            vendor,
            label: `$${Math.round(balance)} balance`,
            days,
            tone: toneFor(days),
        });
    }

    // Credit-runway chips (lambda)
    const creditVendors = ["lambda"] as const;
    const runway = creditRunway(data, now);
    for (const vendor of creditVendors) {
        const row = runway.find((r) => r.vendor === vendor);
        if (!row) continue;

        let days: number | null = null;
        if (row.depletionDate) {
            const msUntil =
                new Date(row.depletionDate).getTime() - now.getTime();
            days = msUntil / 86_400_000;
        }
        const label =
            row.remainingUsd > 0
                ? `$${Math.round(row.remainingUsd).toLocaleString()} remaining`
                : "depleted";

        chips.push({ vendor, label, days, tone: toneFor(days) });
    }

    return chips;
}

function toneFor(days: number | null): "danger" | "warning" | "neutral" {
    if (days == null) return "neutral";
    if (days < 7) return "danger";
    if (days < 21) return "warning";
    return "neutral";
}
