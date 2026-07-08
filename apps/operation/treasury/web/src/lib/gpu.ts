import type { Data, GpuFleetRow } from "../types";
import { toUsd } from "./fx";
import { creditRunway, globalNetRatio } from "./insights";
import { matchesMonth } from "./months";
import { GPU_VENDORS } from "./vendor-vocabulary";

// Deployment-name → model mapping, hardcoded (INTERNAL_VENDORS precedent).
// A vendor-level entry (match /.*/ on an otherwise unmatched name) catches
// single-purpose vendors; unmatched names surface as an "unmapped fleet" flag.
// kind: "gpu" = rented box (idle risk, time-based); "serverless" = scales to
// zero (per-run billing inside the same vendor bill). Hybrid vendors are
// normal — coverage math is basis-agnostic at vendor grain; kind only drives
// the verdict (serverless never "idle-candidate") and a row chip.
// Witnessed 2026-07-08 (REST /v1/billing per surface): runpod serverless
// endpoints burned $2.87 Mar + $115.36 Apr, $0 since — if serverless spend
// returns materially, split the runpod bill by billing surface (deferred;
// the API is per-podId, so a per-deployment witness exists).
export type DeploymentKind = "gpu" | "serverless";

export const GPU_DEPLOYMENT_GROUPS: {
    vendor: string;
    match: RegExp;
    group: string;
    models: string[];
    kind: DeploymentKind;
}[] = [
    {
        vendor: "runpod",
        match: /zimage/i,
        group: "zimage pods",
        models: ["zimage"],
        kind: "gpu",
    },
    {
        vendor: "runpod",
        match: /klein/i,
        group: "klein (A5000)",
        models: ["klein"],
        kind: "gpu",
    },
    // storage billing surface belongs to zimage pods (RunPod charges disk separately)
    {
        vendor: "runpod",
        match: /^_storage$/,
        group: "zimage pods",
        models: ["zimage"],
        kind: "gpu",
    },
    {
        vendor: "lambda",
        match: /gh200|sana|ltx|ace/i,
        group: "GH200 (shared)",
        models: ["ltx-2", "acestep", "sana"],
        kind: "gpu",
    },
    {
        vendor: "lambda",
        match: /./,
        group: "lambda other",
        models: [],
        kind: "gpu",
    },
    {
        vendor: "vast.ai",
        match: /./,
        group: "vast.ai box",
        models: ["flux"],
        kind: "gpu",
    },
    {
        vendor: "modal",
        match: /./,
        group: "modal serverless",
        models: [],
        kind: "serverless",
    },
];

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
    group: string; // "GH200 (shared)"
    vendor: string;
    month: string;
    rentUsd: number | null; // null = no provider bill witnessed that month
    models: string[];
    requests: number;
    paidUsd: number; // Σ price_paid over mapped models
    questUsd: number; // Σ price_quests
    retainedUsd: number; // Σ (price_paid − byop_paid − model_paid)
    coverage: number | null; // retained × netRatio ÷ rent
    effUsdPerReq: number | null;
    breakEven: { model: string; unit: string; volume: number }[];
    verdict: "keep" | "raise?" | "idle-candidate" | null;
    flags: string[]; // "unmapped fleet", "no fleet visibility", …
    kind: DeploymentKind;
};

export type RunwayChip = {
    vendor: string;
    label: string;
    days: number | null;
    tone: "danger" | "warning" | "neutral";
};

// Group the fleet rows by vendor, keeping only the most recent snapshot per
// vendor (all rows with recorded_at equal to that vendor's maximum).
function latestFleet(rows: GpuFleetRow[]): GpuFleetRow[] {
    // max recorded_at per vendor
    const maxAt = new Map<string, string>();
    for (const row of rows) {
        const cur = maxAt.get(row.vendor);
        if (!cur || row.recorded_at > cur)
            maxAt.set(row.vendor, row.recorded_at);
    }
    return rows.filter((row) => row.recorded_at === maxAt.get(row.vendor));
}

// Find the first group definition matching this vendor+deployment name.
// null → unmatched (will surface as "unmapped fleet").
function groupFor(
    vendor: string,
    deployment: string,
): (typeof GPU_DEPLOYMENT_GROUPS)[number] | null {
    return (
        GPU_DEPLOYMENT_GROUPS.find(
            (g) => g.vendor === vendor && g.match.test(deployment),
        ) ?? null
    );
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

// Infra rows (Cloudflare, the EC2/CloudFront share of AWS) have no pollen
// plane — excluded from rent exactly as insights.ts does.
function isInfraRow(row: { category?: string }): boolean {
    return row.category === "infra";
}

export function gpuEconomics(
    data: Data,
    monthFilter: string,
): GpuDeploymentRow[] {
    const netRatio = globalNetRatio(data.revenueMonthly);
    const result: GpuDeploymentRow[] = [];

    for (const vendor of GPU_VENDORS) {
        // Step 1: vendor rent for this month.
        const vendorBills = data.providerMonthly.filter(
            (r) =>
                r.vendor === vendor &&
                matchesMonth(r.month, monthFilter) &&
                !isInfraRow(r),
        );
        // null when no provider rows at all for this vendor+month
        const vendorRentUsd: number | null =
            vendorBills.length === 0
                ? null
                : vendorBills.reduce(
                      (acc, r) =>
                          acc + toUsd(r.credit + r.paid, r.currency, r.month),
                      0,
                  );

        // Collect the unique months that matched (for row emission)
        const matchedMonths = [...new Set(vendorBills.map((r) => r.month))];
        // When monthFilter is a specific month and no bills exist, still emit
        // rows for that month using the fleet snapshot if present.
        const allMonths =
            matchedMonths.length > 0
                ? matchedMonths
                : // no bills: try to emit a row for the filter month if it
                  // is a concrete month or use fleet snapshot months
                  (() => {
                      const fleetMonths = [
                          ...new Set(
                              data.gpuFleet
                                  .filter(
                                      (r) =>
                                          r.vendor === vendor &&
                                          matchesMonth(
                                              r.recorded_at.slice(0, 7),
                                              monthFilter,
                                          ),
                                  )
                                  .map((r) => r.recorded_at.slice(0, 7)),
                          ),
                      ];
                      if (fleetMonths.length > 0) return fleetMonths;
                      // Fall back to pollenMonthly months so pollen rows show even w/o bills
                      const pollenMonths = [
                          ...new Set(
                              data.pollenMonthly
                                  .filter(
                                      (r) =>
                                          r.vendor === vendor &&
                                          matchesMonth(r.month, monthFilter),
                                  )
                                  .map((r) => r.month),
                          ),
                      ];
                      return pollenMonths;
                  })();

        // When there is genuinely no signal for this vendor in this month, skip.
        if (allMonths.length === 0 && vendorRentUsd === null) continue;

        // Treat an empty month list as the filter month itself (may still have fleet).
        const months: string[] =
            allMonths.length > 0
                ? allMonths
                : typeof monthFilter === "string" &&
                    /^\d{4}-\d{2}$/.test(monthFilter)
                  ? [monthFilter]
                  : [];

        for (const month of months) {
            // Step 2: fleet shares for this month.
            const fleetInMonth = data.gpuFleet.filter(
                (r) =>
                    r.vendor === vendor && r.recorded_at.slice(0, 7) === month,
            );

            // ovhcloud never has fleet data
            const isOvhcloud = vendor === "ovhcloud";

            // No snapshots → vendor-level group with 100% share + flag.
            if (fleetInMonth.length === 0 || isOvhcloud) {
                // Emit one vendor-total row.
                const vendorKind: DeploymentKind =
                    vendor === "modal" ? "serverless" : "gpu";
                const flags: string[] = ["no fleet that month"];
                if (isOvhcloud) {
                    flags.push("no fleet visibility");
                    flags.push("hybrid: AI Endpoints + instance");
                }

                const pollenRows = data.pollenMonthly.filter(
                    (r) => r.vendor === vendor && r.month === month,
                );
                const { requests, paidUsd, questUsd, retainedUsd } =
                    aggregatePollen(pollenRows, month);
                const models = [...new Set(pollenRows.map((r) => r.model))];

                const coverage = computeCoverage(
                    retainedUsd,
                    netRatio,
                    vendorRentUsd,
                );
                const effUsdPerReq =
                    vendorRentUsd != null && requests > 0
                        ? vendorRentUsd / requests
                        : null;

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
                    effUsdPerReq,
                    breakEven: computeBreakEven(
                        models,
                        vendorRentUsd,
                        netRatio,
                    ),
                    verdict: verdictFor(coverage, vendorKind),
                    flags,
                    kind: vendorKind,
                });
                continue;
            }

            // Step 2 (continued): assign each fleet deployment to a group.
            // Compute each group's mean share of the per-snapshot Σusd_per_hr.
            // Snapshots may be multiple per month; group by recorded_at first.
            const snapshotTimes = [
                ...new Set(fleetInMonth.map((r) => r.recorded_at)),
            ];

            // group name → { def, totalRateShare } accumulated over snapshots
            const groupShares = new Map<
                string,
                {
                    def: (typeof GPU_DEPLOYMENT_GROUPS)[number] | null;
                    totalShare: number;
                }
            >();

            for (const snapshotTime of snapshotTimes) {
                const snapshot = fleetInMonth.filter(
                    (r) => r.recorded_at === snapshotTime,
                );
                const snapshotTotal = snapshot.reduce(
                    (acc, r) => acc + r.usd_per_hr,
                    0,
                );
                if (snapshotTotal === 0) continue;

                for (const row of snapshot) {
                    const def = groupFor(vendor, row.deployment);
                    if (def === null) {
                        // Unmatched deployment: one unmapped bucket per deployment name
                        const key = `__unmapped__${row.deployment}`;
                        const entry = groupShares.get(key) ?? {
                            def: null,
                            totalShare: 0,
                        };
                        entry.totalShare += row.usd_per_hr / snapshotTotal;
                        groupShares.set(key, entry);
                    } else {
                        const key = def.group;
                        const entry = groupShares.get(key) ?? {
                            def,
                            totalShare: 0,
                        };
                        entry.totalShare += row.usd_per_hr / snapshotTotal;
                        groupShares.set(key, entry);
                    }
                }
            }

            // Mean share per group across snapshots.
            const groupEntries = [...groupShares.entries()].map(
                ([key, { def, totalShare }]) => ({
                    key,
                    def,
                    meanShare: totalShare / snapshotTimes.length,
                }),
            );

            // Invariant: Σ group rents == vendor rent.
            // Allocate all but the last group by their mean share; the last
            // group gets the remainder to kill float drift.
            if (vendorRentUsd !== null) {
                let assigned = 0;
                for (let i = 0; i < groupEntries.length - 1; i++) {
                    const allocated = vendorRentUsd * groupEntries[i].meanShare;
                    groupEntries[i] = {
                        ...groupEntries[i],
                        meanShare: allocated / vendorRentUsd,
                    };
                    assigned += allocated;
                }
                // Last entry: remainder
                if (groupEntries.length > 0) {
                    const last = groupEntries[groupEntries.length - 1];
                    const remainder = vendorRentUsd - assigned;
                    groupEntries[groupEntries.length - 1] = {
                        ...last,
                        meanShare: remainder / vendorRentUsd,
                    };
                }
            }

            for (const { key, def, meanShare } of groupEntries) {
                const isUnmapped = key.startsWith("__unmapped__");
                const deploymentName = isUnmapped
                    ? key.slice("__unmapped__".length)
                    : null;
                const groupName = isUnmapped
                    ? (deploymentName ?? key)
                    : (def?.group ?? key);
                const models: string[] = isUnmapped ? [] : (def?.models ?? []);
                const kind: DeploymentKind = isUnmapped
                    ? "gpu"
                    : (def?.kind ?? "gpu");

                const rentShare =
                    vendorRentUsd !== null ? vendorRentUsd * meanShare : null;

                const pollenRows = data.pollenMonthly.filter(
                    (r) =>
                        r.vendor === vendor &&
                        r.month === month &&
                        models.includes(r.model),
                );
                const { requests, paidUsd, questUsd, retainedUsd } =
                    aggregatePollen(pollenRows, month);

                const coverage = computeCoverage(
                    retainedUsd,
                    netRatio,
                    rentShare,
                );
                const effUsdPerReq =
                    rentShare != null && requests > 0
                        ? rentShare / requests
                        : null;

                const flags: string[] = [];
                if (isUnmapped) flags.push("unmapped fleet");

                result.push({
                    group: groupName,
                    vendor,
                    month,
                    rentUsd: rentShare,
                    models,
                    requests,
                    paidUsd,
                    questUsd,
                    retainedUsd,
                    coverage,
                    effUsdPerReq,
                    breakEven: computeBreakEven(models, rentShare, netRatio),
                    verdict: verdictFor(coverage, kind),
                    flags,
                    kind,
                });
            }
        }
    }

    return result;
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
// lambda / ovhcloud: reuse creditRunway() depletion signal.
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
        const totalBalance = latest.reduce(
            (acc, r) => acc + (r.balance_usd ?? 0),
            0,
        );

        const dailyBurn = totalRatePerHr * 24;
        const days = dailyBurn > 0 ? totalBalance / dailyBurn : null;
        chips.push({
            vendor,
            label: `$${Math.round(totalBalance)} balance`,
            days,
            tone: toneFor(days),
        });
    }

    // Credit-runway chips (lambda, ovhcloud)
    const creditVendors = ["lambda", "ovhcloud"] as const;
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
