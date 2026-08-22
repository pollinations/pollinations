import {
    Chip,
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { GaugeSummary } from "../components/EconomicsGauge";
import { StatCards } from "../components/StatCards";
import {
    computeModeIndex,
    providerMonthComputeMode,
} from "../lib/computeModes";
import { fmtMarginPct, fmtNumber, fmtUsd, fmtUsd4 } from "../lib/format";
import { toUsd } from "../lib/fx";
import {
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "../lib/insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import { canonicalVendor } from "../lib/tb";
import { signedToneOrSoft } from "../lib/tone";
import { isCreditSupported } from "../lib/unitEconomics";
import type { Data, OpCloudRow } from "../types";

const REGISTRY_UNIT_PRICES: Record<string, { price: number; unit: string }> = {
    zimage: { price: 0.002, unit: "img" },
    klein: { price: 0.01, unit: "img" },
    "ltx-2": { price: 0.005, unit: "s" },
};

export type GpuEconomicsRow = {
    vendor: string;
    models: string;
    resources: number;
    month: string;
    rentUsd: number;
    paidRentUsd: number;
    creditRentUsd: number;
    requests: number;
    paidUsd: number;
    questUsd: number;
    retainedUsd: number;
    cashMarginUsd: number;
    cashMarginPct: number | null;
    marginUsd: number;
    marginPct: number | null;
    effUsdPerReq: number | null;
    breakEven: { model: string; unit: string; volume: number }[];
    flags: string[];
};

type GpuSummary = {
    paidUsd: number;
    questUsd: number;
    rentUsd: number;
    paidRentUsd: number;
    creditRentUsd: number;
    retainedUsd: number;
    cashMarginUsd: number;
    cashMarginPct: number | null;
    marginUsd: number;
    marginPct: number | null;
    flaggedRows: number;
    mixedRows: number;
};

export type GpuResourceRow = {
    kind: "gpu" | "overhead";
    month: string;
    vendor: string;
    resourceId: string;
    resourceName: string;
    hardware: string;
    models: string;
    gpuHours: number | null;
    storageHours: number | null;
    networkGb: number | null;
    paidCostUsd: number;
    creditCostUsd: number;
    totalCostUsd: number;
    costPerGpuHour: number | null;
    relatedResources: number;
};

export type GpuWorkloadRow = {
    key: string;
    kind: "workload" | "unassigned" | "overhead";
    workload: string;
    vendors: string;
    gpuCount: number;
    paidUsd: number | null;
    questUsd: number | null;
    retainedUsd: number | null;
    paidCostUsd: number;
    creditCostUsd: number;
    totalCostUsd: number;
    currentResultUsd: number | null;
    currentPerformancePct: number | null;
    fullCostResultUsd: number | null;
    fullCostPerformancePct: number | null;
    resources: GpuResourceRow[];
    flags: string[];
};

type GpuResourceSummary = {
    gpuCount: number;
    overheadCostUsd: number;
    overheadResources: number;
    totalCostUsd: number;
};

type UsageKind = "gpu" | "storage" | "download" | "upload";

const USAGE_KIND_BY_SKU: Record<string, UsageKind> = {
    "gpu-hours": "gpu",
    "storage-hours": "storage",
    "download-gb": "download",
    "upload-gb": "upload",
};

const LEGACY_HOURLY_VENDORS = new Set(["lambda", "runpod"]);
const NON_RESOURCE_PATTERN =
    /refund|grant|promo|credit|settlement|reconcil|account total|billing-history|startup program|top.?up/i;

function usageKind(row: OpCloudRow): UsageKind | null {
    return USAGE_KIND_BY_SKU[row.resource_sku.trim().toLowerCase()] ?? null;
}

function isFinancialOrAggregateRow(row: OpCloudRow): boolean {
    return NON_RESOURCE_PATTERN.test(
        `${row.resource_id} ${row.resource_name} ${row.resource_sku}`,
    );
}

function cleanResourceName(
    vendor: string,
    resourceId: string,
    names: readonly string[],
): string {
    if (vendor === "vast.ai" && resourceId) return `#${resourceId}`;
    const candidate =
        names.find((name) => name.trim() && name.trim() !== resourceId) ??
        resourceId;
    return (
        candidate.replace(/\s*·\s*(gpu|storage|download|upload)$/i, "") ||
        "Unassigned GPU"
    );
}

function displayHardware(values: Set<string>): string {
    return [...values]
        .filter(
            (value) =>
                value &&
                !USAGE_KIND_BY_SKU[value.toLowerCase()] &&
                !/^[\d.,]+$/.test(value),
        )
        .sort()
        .join(", ");
}

function splitModels(model: string): string[] {
    return model
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function computeBreakEven(
    models: string[],
    rentUsd: number,
): { model: string; unit: string; volume: number }[] {
    if (rentUsd <= 0) return [];
    const result: { model: string; unit: string; volume: number }[] = [];
    for (const model of models) {
        const entry = REGISTRY_UNIT_PRICES[model];
        if (!entry) continue;
        result.push({
            model,
            unit: entry.unit,
            volume: rentUsd / entry.price,
        });
    }
    return result;
}

export function demandCoveragePct(
    pollenDemandUsd: number,
    gpuCostUsd: number,
): number | null {
    return gpuCostUsd > 0
        ? (Math.max(0, pollenDemandUsd) / gpuCostUsd) * 100
        : null;
}

// Vendor-month totals power the summary cards. The workload table below uses
// only direct resource-to-workload mappings from OP Cloud; it never allocates a
// vendor pool across models by ratio. Mixed inference/GPU provider-months keep
// Pollen unallocated so the same demand cannot appear in two views.
export function gpuEconomics(data: Data, monthFilter: MonthFilterValue) {
    type Acc = GpuEconomicsRow & {
        cloudModelSet: Set<string>;
        pollenModelSet: Set<string>;
        resourceSet: Set<string>;
    };
    const groups = new Map<string, Acc>();
    const modeIndex = computeModeIndex(data);

    for (const row of data.opCloud ?? []) {
        if (row.type !== "gpu" || canonicalVendor(row.vendor) === "community") {
            continue;
        }
        const month = opCloudMonth(row);
        if (month < WINDOW_START || !matchesMonth(month, monthFilter)) {
            continue;
        }
        const paidRentUsd = opCloudPaidBurnUsd(row);
        const creditRentUsd = opCloudCreditBurnUsd(row);
        const rentUsd = paidRentUsd + creditRentUsd;
        // Keep refund rows (negative paid burn) so they reduce the group's
        // rent — skipping them would overstate GPU rent vs the Providers tab.
        if (paidRentUsd === 0 && creditRentUsd === 0) continue;

        const key = `${month}|${row.vendor}`;
        const acc = groups.get(key) ?? {
            vendor: row.vendor,
            models: "",
            resources: 0,
            month,
            rentUsd: 0,
            paidRentUsd: 0,
            creditRentUsd: 0,
            requests: 0,
            paidUsd: 0,
            questUsd: 0,
            retainedUsd: 0,
            cashMarginUsd: 0,
            cashMarginPct: null,
            marginUsd: 0,
            marginPct: null,
            effUsdPerReq: null,
            breakEven: [],
            flags: [],
            cloudModelSet: new Set<string>(),
            pollenModelSet: new Set<string>(),
            resourceSet: new Set<string>(),
        };
        acc.rentUsd += rentUsd;
        acc.paidRentUsd += paidRentUsd;
        acc.creditRentUsd += creditRentUsd;
        for (const modelName of splitModels(row.model)) {
            acc.cloudModelSet.add(modelName);
        }
        if (row.source !== "correction" && row.resource_id.trim()) {
            acc.resourceSet.add(row.resource_id.trim());
        }
        groups.set(key, acc);
    }

    for (const pollen of data.opPollen ?? []) {
        if (
            canonicalVendor(pollen.vendor) === "community" ||
            pollen.month < WINDOW_START ||
            !matchesMonth(pollen.month, monthFilter)
        ) {
            continue;
        }
        if (
            providerMonthComputeMode(modeIndex, pollen.month, pollen.vendor) !==
            "gpu-capacity"
        ) {
            continue;
        }
        const acc = groups.get(`${pollen.month}|${pollen.vendor}`);
        if (!acc) continue;

        for (const modelName of splitModels(pollen.model)) {
            acc.pollenModelSet.add(modelName);
        }
        acc.requests += pollen.requests_paid + pollen.requests_quests;
        acc.paidUsd += toUsd(pollen.price_paid, pollen.currency, pollen.month);
        acc.questUsd += toUsd(
            pollen.price_quests,
            pollen.currency,
            pollen.month,
        );
        acc.retainedUsd += toUsd(
            pollen.price_paid - pollen.byop_paid - pollen.model_paid,
            pollen.currency,
            pollen.month,
        );
    }

    return [...groups.values()]
        .map((row): GpuEconomicsRow => {
            const modelSet =
                row.pollenModelSet.size > 0
                    ? row.pollenModelSet
                    : row.cloudModelSet;
            const models = [...modelSet].sort();
            const flags: string[] = [];
            const mode = providerMonthComputeMode(
                modeIndex,
                row.month,
                row.vendor,
            );
            if (models.length === 0) flags.push("missing model");
            if (mode === "mixed") {
                flags.push("mixed mode · Pollen unallocated");
            } else if (models.length > 0 && row.requests <= 0) {
                flags.push("no Pollen demand");
            }
            const cashMarginUsd = row.retainedUsd - row.paidRentUsd;
            const marginUsd = row.retainedUsd - row.rentUsd;
            return {
                ...row,
                models: models.join(", "),
                resources: row.resourceSet.size,
                cashMarginUsd,
                cashMarginPct:
                    row.retainedUsd > 0
                        ? (cashMarginUsd / row.retainedUsd) * 100
                        : null,
                marginUsd,
                marginPct:
                    row.retainedUsd > 0
                        ? (marginUsd / row.retainedUsd) * 100
                        : null,
                effUsdPerReq:
                    row.requests > 0 ? row.rentUsd / row.requests : null,
                breakEven: computeBreakEven(models, row.rentUsd),
                flags,
            };
        })
        .sort((a, b) => {
            if (a.marginPct == null && b.marginPct == null) {
                return a.marginUsd - b.marginUsd || b.rentUsd - a.rentUsd;
            }
            if (a.marginPct == null) return 1;
            if (b.marginPct == null) return -1;
            return a.marginPct - b.marginPct || b.rentUsd - a.rentUsd;
        });
}

export function visibleGpuRows(rows: GpuEconomicsRow[], vendor: ValueFilter) {
    return rows.filter((row) => matchesValue(row.vendor, vendor));
}

// The GPU table is resource-grain. Vendor-month Pollen stays in the cards
// because generation events do not identify the GPU instance that served a
// request; copying that revenue onto every resource would multiply it.
export function gpuResourceRows(
    data: Data,
    monthFilter: MonthFilterValue,
): GpuResourceRow[] {
    type ResourceAcc = {
        month: string;
        vendor: string;
        resourceId: string;
        names: Set<string>;
        hardware: Set<string>;
        models: Set<string>;
        gpuHours: number;
        storageHours: number;
        networkGb: number;
        hasGpuHours: boolean;
        hasStorageHours: boolean;
        hasNetwork: boolean;
        hasStructuredUsage: boolean;
        hasPositiveCost: boolean;
        isAdjustment: boolean;
        paidCostUsd: number;
        creditCostUsd: number;
    };

    const groups = new Map<string, ResourceAcc>();

    for (const row of data.opCloud ?? []) {
        const vendor = canonicalVendor(row.vendor);
        if (row.type !== "gpu" || vendor === "community") continue;
        const month = opCloudMonth(row);
        if (month < WINDOW_START || !matchesMonth(month, monthFilter)) {
            continue;
        }

        const paidCostUsd = opCloudPaidBurnUsd(row);
        const creditCostUsd = opCloudCreditBurnUsd(row);
        const totalCostUsd = paidCostUsd + creditCostUsd;
        if (paidCostUsd === 0 && creditCostUsd === 0) continue;

        const resourceId = row.resource_id.trim();
        const key = `${month}|${vendor}|${resourceId || row.entry_id}`;
        const acc = groups.get(key) ?? {
            month,
            vendor,
            resourceId,
            names: new Set<string>(),
            hardware: new Set<string>(),
            models: new Set<string>(),
            gpuHours: 0,
            storageHours: 0,
            networkGb: 0,
            hasGpuHours: false,
            hasStorageHours: false,
            hasNetwork: false,
            hasStructuredUsage: false,
            hasPositiveCost: false,
            isAdjustment: false,
            paidCostUsd: 0,
            creditCostUsd: 0,
        };

        const kind = usageKind(row);
        const quantity = Math.max(0, Number(row.resource_count) || 0);
        acc.paidCostUsd += paidCostUsd;
        acc.creditCostUsd += creditCostUsd;
        acc.hasPositiveCost ||= totalCostUsd > 0;
        acc.isAdjustment ||= isFinancialOrAggregateRow(row);
        if (row.resource_name.trim()) acc.names.add(row.resource_name.trim());
        if (row.resource_sku.trim()) acc.hardware.add(row.resource_sku.trim());
        for (const model of splitModels(row.model)) acc.models.add(model);

        if (kind) acc.hasStructuredUsage = true;
        if (kind === "gpu") {
            acc.gpuHours += quantity;
            acc.hasGpuHours = true;
        } else if (kind === "storage") {
            acc.storageHours += quantity;
            acc.hasStorageHours = true;
        } else if (kind === "download" || kind === "upload") {
            acc.networkGb += quantity;
            acc.hasNetwork = true;
        } else if (
            LEGACY_HOURLY_VENDORS.has(vendor) &&
            !acc.isAdjustment &&
            quantity > 0
        ) {
            // Historical Lambda and RunPod extracts recorded billed GPU hours
            // directly in resource_count before explicit usage-kind SKUs.
            acc.gpuHours += quantity;
            acc.hasGpuHours = true;
        }

        groups.set(key, acc);
    }

    const gpuRows: GpuResourceRow[] = [];
    const overheadByVendorMonth = new Map<
        string,
        GpuResourceRow & { resourceIds: Set<string> }
    >();

    for (const acc of groups.values()) {
        const isGpu =
            acc.hasGpuHours ||
            (!acc.hasStructuredUsage &&
                Boolean(acc.resourceId) &&
                acc.hasPositiveCost &&
                !acc.isAdjustment);
        const totalCostUsd = acc.paidCostUsd + acc.creditCostUsd;

        if (isGpu) {
            const gpuHours = acc.hasGpuHours ? acc.gpuHours : null;
            gpuRows.push({
                kind: "gpu",
                month: acc.month,
                vendor: acc.vendor,
                resourceId: acc.resourceId,
                resourceName: cleanResourceName(acc.vendor, acc.resourceId, [
                    ...acc.names,
                ]),
                hardware: displayHardware(acc.hardware),
                models: [...acc.models].sort().join(", "),
                gpuHours,
                storageHours: acc.hasStorageHours ? acc.storageHours : null,
                networkGb: acc.hasNetwork ? acc.networkGb : null,
                paidCostUsd: acc.paidCostUsd,
                creditCostUsd: acc.creditCostUsd,
                totalCostUsd,
                costPerGpuHour:
                    gpuHours != null && gpuHours > 0
                        ? totalCostUsd / gpuHours
                        : null,
                relatedResources: 1,
            });
            continue;
        }

        const overheadKey = `${acc.month}|${acc.vendor}`;
        const overhead = overheadByVendorMonth.get(overheadKey) ?? {
            kind: "overhead" as const,
            month: acc.month,
            vendor: acc.vendor,
            resourceId: "",
            resourceName: "Overhead & adjustments",
            hardware: "",
            models: "",
            gpuHours: null,
            storageHours: 0,
            networkGb: 0,
            paidCostUsd: 0,
            creditCostUsd: 0,
            totalCostUsd: 0,
            costPerGpuHour: null,
            relatedResources: 0,
            resourceIds: new Set<string>(),
        };
        overhead.paidCostUsd += acc.paidCostUsd;
        overhead.creditCostUsd += acc.creditCostUsd;
        overhead.totalCostUsd += totalCostUsd;
        overhead.storageHours =
            (overhead.storageHours ?? 0) +
            (acc.hasStorageHours ? acc.storageHours : 0);
        overhead.networkGb =
            (overhead.networkGb ?? 0) + (acc.hasNetwork ? acc.networkGb : 0);
        overhead.resourceIds.add(acc.resourceId || overheadKey);
        overhead.relatedResources = overhead.resourceIds.size;
        overheadByVendorMonth.set(overheadKey, overhead);
    }

    return [
        ...gpuRows,
        ...[...overheadByVendorMonth.values()].map(
            ({ resourceIds: _resourceIds, ...row }) => ({
                ...row,
                storageHours: row.storageHours || null,
                networkGb: row.networkGb || null,
            }),
        ),
    ];
}

export function visibleGpuResourceRows(
    rows: GpuResourceRow[],
    vendor: ValueFilter,
) {
    return rows.filter((row) => matchesValue(row.vendor, vendor));
}

export function gpuResourceSummary(rows: GpuResourceRow[]): GpuResourceSummary {
    return rows.reduce<GpuResourceSummary>(
        (summary, row) => {
            summary.totalCostUsd += row.totalCostUsd;
            if (row.kind === "gpu") {
                summary.gpuCount += 1;
            } else {
                summary.overheadCostUsd += row.totalCostUsd;
                summary.overheadResources += row.relatedResources;
            }
            return summary;
        },
        {
            gpuCount: 0,
            overheadCostUsd: 0,
            overheadResources: 0,
            totalCostUsd: 0,
        },
    );
}

function workloadModels(models: string): string[] {
    return [...new Set(splitModels(models))].sort();
}

function workloadKey(models: readonly string[]): string {
    return models.length > 0 ? `workload|${models.join("|")}` : "unassigned";
}

function workloadLabel(models: readonly string[]): string {
    return models.length > 0 ? models.join(" + ") : "Unassigned";
}

// Workload economics is exact only when OP Cloud names the workload served by
// a billed resource. Pollen can then join at vendor + model + month. Individual
// GPU children retain direct provider usage/cost only because Pollen does not
// identify which replica served a request.
export function gpuWorkloadRows(
    data: Data,
    monthFilter: MonthFilterValue,
    vendorFilter: ValueFilter = "all",
): GpuWorkloadRow[] {
    type WorkloadAcc = {
        key: string;
        kind: GpuWorkloadRow["kind"];
        models: Set<string>;
        costVendors: Set<string>;
        pollenVendors: Set<string>;
        resources: GpuResourceRow[];
        paidUsd: number;
        questUsd: number;
        retainedUsd: number;
        paidCostUsd: number;
        creditCostUsd: number;
        hasPollen: boolean;
        hasCost: boolean;
    };

    const groups = new Map<string, WorkloadAcc>();
    const ensure = (
        key: string,
        kind: GpuWorkloadRow["kind"],
        models: readonly string[],
    ) => {
        const current = groups.get(key);
        if (current) return current;
        const created: WorkloadAcc = {
            key,
            kind,
            models: new Set(models),
            costVendors: new Set<string>(),
            pollenVendors: new Set<string>(),
            resources: [],
            paidUsd: 0,
            questUsd: 0,
            retainedUsd: 0,
            paidCostUsd: 0,
            creditCostUsd: 0,
            hasPollen: false,
            hasCost: false,
        };
        groups.set(key, created);
        return created;
    };

    const resourceRows = visibleGpuResourceRows(
        gpuResourceRows(data, monthFilter),
        vendorFilter,
    );
    for (const resource of resourceRows) {
        const models = workloadModels(resource.models);
        const kind =
            resource.kind === "overhead"
                ? "overhead"
                : models.length > 0
                  ? "workload"
                  : "unassigned";
        const key = kind === "overhead" ? "overhead" : workloadKey(models);
        const group = ensure(key, kind, models);
        group.costVendors.add(resource.vendor);
        group.resources.push(resource);
        group.paidCostUsd += resource.paidCostUsd;
        group.creditCostUsd += resource.creditCostUsd;
        group.hasCost = true;
    }

    const modeIndex = computeModeIndex(data);
    for (const pollen of data.opPollen ?? []) {
        const vendor = canonicalVendor(pollen.vendor);
        if (
            vendor === "community" ||
            pollen.month < WINDOW_START ||
            !matchesMonth(pollen.month, monthFilter) ||
            !matchesValue(vendor, vendorFilter) ||
            providerMonthComputeMode(modeIndex, pollen.month, vendor) !==
                "gpu-capacity"
        ) {
            continue;
        }

        const model = pollen.model.trim() || "Unassigned Pollen model";
        const exact = groups.get(workloadKey([model]));
        const containing = [...groups.values()].filter(
            (group) =>
                group.kind === "workload" &&
                group.models.has(model) &&
                group.costVendors.has(vendor),
        );
        const group =
            containing.length === 1
                ? containing[0]
                : (exact ?? ensure(workloadKey([model]), "workload", [model]));
        group.pollenVendors.add(vendor);
        group.hasPollen = true;
        group.paidUsd += toUsd(
            pollen.price_paid,
            pollen.currency,
            pollen.month,
        );
        group.questUsd += toUsd(
            pollen.price_quests,
            pollen.currency,
            pollen.month,
        );
        group.retainedUsd += toUsd(
            pollen.price_paid - pollen.byop_paid - pollen.model_paid,
            pollen.currency,
            pollen.month,
        );
    }

    return [...groups.values()].map((group): GpuWorkloadRow => {
        const totalCostUsd = group.paidCostUsd + group.creditCostUsd;
        const currentResultUsd =
            group.kind === "overhead"
                ? -group.paidCostUsd
                : group.kind === "workload" && group.hasPollen && group.hasCost
                  ? group.retainedUsd - group.paidCostUsd
                  : null;
        const fullCostResultUsd =
            group.kind === "overhead"
                ? -totalCostUsd
                : group.kind === "workload" && group.hasPollen && group.hasCost
                  ? group.retainedUsd - totalCostUsd
                  : null;
        const flags: string[] = [];
        if (group.kind === "unassigned") flags.push("unmapped");
        if (group.kind === "workload" && !group.hasPollen) {
            flags.push("missing Pollen");
        }
        if (group.kind === "workload" && !group.hasCost) {
            flags.push("missing GPU cost");
        }
        if (isCreditSupported(currentResultUsd, fullCostResultUsd)) {
            flags.push("credit-supported");
        }
        const vendors = new Set([...group.costVendors, ...group.pollenVendors]);
        return {
            key: group.key,
            kind: group.kind,
            workload:
                group.kind === "overhead"
                    ? "Overhead & adjustments"
                    : workloadLabel([...group.models].sort()),
            vendors: [...vendors].sort().join(", "),
            gpuCount: group.resources.filter((row) => row.kind === "gpu")
                .length,
            paidUsd: group.hasPollen ? group.paidUsd : null,
            questUsd: group.hasPollen ? group.questUsd : null,
            retainedUsd: group.hasPollen ? group.retainedUsd : null,
            paidCostUsd: group.paidCostUsd,
            creditCostUsd: group.creditCostUsd,
            totalCostUsd,
            currentResultUsd,
            currentPerformancePct:
                currentResultUsd != null && group.retainedUsd > 0
                    ? (currentResultUsd / group.retainedUsd) * 100
                    : null,
            fullCostResultUsd,
            fullCostPerformancePct:
                fullCostResultUsd != null && group.retainedUsd > 0
                    ? (fullCostResultUsd / group.retainedUsd) * 100
                    : null,
            resources: group.resources.sort(
                (left, right) =>
                    right.totalCostUsd - left.totalCostUsd ||
                    left.resourceName.localeCompare(right.resourceName),
            ),
            flags,
        };
    });
}

export function gpuSummary(rows: GpuEconomicsRow[]): GpuSummary {
    const summary: GpuSummary = {
        paidUsd: 0,
        questUsd: 0,
        rentUsd: 0,
        paidRentUsd: 0,
        creditRentUsd: 0,
        retainedUsd: 0,
        cashMarginUsd: 0,
        cashMarginPct: null,
        marginUsd: 0,
        marginPct: null,
        flaggedRows: 0,
        mixedRows: 0,
    };
    for (const row of rows) {
        summary.paidUsd += row.paidUsd;
        summary.questUsd += row.questUsd;
        summary.rentUsd += row.rentUsd;
        summary.paidRentUsd += row.paidRentUsd;
        summary.creditRentUsd += row.creditRentUsd;
        summary.retainedUsd += row.retainedUsd;
        if (row.flags.length > 0) summary.flaggedRows += 1;
        if (row.flags.includes("mixed mode · Pollen unallocated")) {
            summary.mixedRows += 1;
        }
    }
    summary.cashMarginUsd = summary.retainedUsd - summary.paidRentUsd;
    summary.cashMarginPct =
        summary.retainedUsd > 0
            ? (summary.cashMarginUsd / summary.retainedUsd) * 100
            : null;
    summary.marginUsd = summary.retainedUsd - summary.rentUsd;
    summary.marginPct =
        summary.retainedUsd > 0
            ? (summary.marginUsd / summary.retainedUsd) * 100
            : null;
    return summary;
}

function marginTone(value: number) {
    if (value > 0) return "pos";
    if (value < 0) return "neg";
    return "base";
}

function fmtSignedUsd(value: number | null): string {
    if (value == null) return "–";
    const formatted = fmtUsd(value);
    return value > 0 ? `+${formatted}` : formatted;
}

const RESOURCE_SORT_COLUMNS: readonly SortColumn<GpuResourceRow>[] = [
    { key: "resource", value: (row) => row.resourceName },
    { key: "vendor", value: (row) => row.vendor },
    { key: "gpuHours", value: (row) => row.gpuHours },
    { key: "storageHours", value: (row) => row.storageHours },
    { key: "networkGb", value: (row) => row.networkGb },
    { key: "paidCostUsd", value: (row) => row.paidCostUsd },
    { key: "creditCostUsd", value: (row) => row.creditCostUsd },
    { key: "totalCostUsd", value: (row) => row.totalCostUsd },
    { key: "costPerGpuHour", value: (row) => row.costPerGpuHour },
];

function GpuInstanceTable({ rows }: { rows: GpuResourceRow[] }) {
    const { headerProps, rows: sorted } = useSortableRows(
        rows,
        RESOURCE_SORT_COLUMNS,
        { key: "totalCostUsd", direction: "desc" },
    );

    return (
        <div className="overflow-x-auto p-2">
            <DataTable className="min-w-[980px] text-sm">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("resource")}
                        >
                            GPU
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Usage
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cost
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("costPerGpuHour")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "All costs attached to this GPU divided by its billed GPU hours.",
                                    formula:
                                        "(cash + consumed credit) ÷ GPU hours",
                                }}
                            >
                                $ / GPU h
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("gpuHours")}
                        >
                            GPU h
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("storageHours")}
                        >
                            Storage h
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("networkGb")}
                        >
                            Network GB
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("paidCostUsd")}
                        >
                            Cash
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("creditCostUsd")}
                        >
                            Credit
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("totalCostUsd")}
                        >
                            Total
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        sorted,
                        (row) => `${row.vendor}|${row.kind}|${row.resourceId}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>
                                <span className="block font-medium">
                                    {row.resourceName}
                                </span>
                                {row.kind === "overhead" ? (
                                    <span className="text-muted block text-xs">
                                        {fmtNumber(row.relatedResources)} source
                                        {row.relatedResources === 1 ? "" : "s"}
                                    </span>
                                ) : (
                                    <>
                                        {!row.resourceName.includes(
                                            row.resourceId,
                                        ) &&
                                            row.resourceId && (
                                                <span className="text-muted block text-xs">
                                                    {row.resourceId}
                                                </span>
                                            )}
                                        {row.hardware && (
                                            <span className="text-muted block text-xs">
                                                {row.hardware}
                                            </span>
                                        )}
                                    </>
                                )}
                            </TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtNumber(row.gpuHours)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.storageHours)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.networkGb)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtUsd(row.paidCostUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.creditCostUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.totalCostUsd)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtUsd4(row.costPerGpuHour)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </div>
    );
}

export function GpuTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const poolRows = useMemo(
        () => visibleGpuRows(gpuEconomics(data, month), vendor),
        [data, month, vendor],
    );
    const resourceRows = useMemo(
        () => visibleGpuResourceRows(gpuResourceRows(data, month), vendor),
        [data, month, vendor],
    );
    const rows = useMemo(
        () => gpuWorkloadRows(data, month, vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => gpuSummary(poolRows), [poolRows]);
    const resourceStats = useMemo(
        () => gpuResourceSummary(resourceRows),
        [resourceRows],
    );
    const unassignedCostUsd = useMemo(
        () =>
            rows
                .filter((row) => row.kind === "unassigned")
                .reduce((sum, row) => sum + row.totalCostUsd, 0),
        [rows],
    );
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const sortColumns = useMemo<SortColumn<GpuWorkloadRow>[]>(
        () => [
            { key: "workload", value: (row) => row.workload },
            { key: "vendors", value: (row) => row.vendors },
            { key: "gpuCount", value: (row) => row.gpuCount },
            { key: "retainedUsd", value: (row) => row.retainedUsd },
            { key: "questUsd", value: (row) => row.questUsd },
            { key: "paidCostUsd", value: (row) => row.paidCostUsd },
            { key: "creditCostUsd", value: (row) => row.creditCostUsd },
            { key: "totalCostUsd", value: (row) => row.totalCostUsd },
            { key: "currentResultUsd", value: (row) => row.currentResultUsd },
            {
                key: "currentPerformancePct",
                value: (row) => row.currentPerformancePct,
            },
            {
                key: "fullCostResultUsd",
                value: (row) => row.fullCostResultUsd,
            },
            {
                key: "fullCostPerformancePct",
                value: (row) => row.fullCostPerformancePct,
            },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns, {
        key: "fullCostResultUsd",
        direction: "asc",
    });
    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "GPUs",
                        value: fmtNumber(resourceStats.gpuCount),
                        detail:
                            unassignedCostUsd > 0
                                ? `${fmtUsd(unassignedCostUsd)} unassigned`
                                : resourceStats.overheadCostUsd !== 0
                                  ? `${fmtUsd(resourceStats.overheadCostUsd)} overhead & adjustments`
                                  : "one row per GPU resource",
                    },
                    {
                        label: "Retained Paid",
                        value: fmtUsd(stats.retainedUsd),
                        detail: (
                            <GaugeSummary
                                left={stats.paidUsd}
                                leftLabel="Paid"
                                right={stats.questUsd}
                                rightLabel="Quest"
                            />
                        ),
                    },
                    {
                        label: "GPU cost",
                        value: fmtUsd(resourceStats.totalCostUsd),
                        detail: (
                            <GaugeSummary
                                left={stats.paidRentUsd}
                                leftLabel="cash"
                                palette="neutral"
                                right={stats.creditRentUsd}
                                rightLabel="credit"
                            />
                        ),
                    },
                    {
                        label: "Current result",
                        value: fmtSignedUsd(stats.cashMarginUsd),
                        tone: marginTone(stats.cashMarginUsd),
                        detail: `with credits · ${fmtMarginPct(stats.cashMarginPct)}`,
                    },
                    {
                        label: "Full-cost result",
                        value: fmtSignedUsd(stats.marginUsd),
                        tone: marginTone(stats.marginUsd),
                        detail: `without credits · ${fmtMarginPct(stats.marginPct)}`,
                    },
                ]}
            />
            {stats.mixedRows > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <Chip intent="warning" size="sm">
                        {stats.mixedRows} mixed month
                        {stats.mixedRows === 1 ? "" : "s"} unallocated
                    </Chip>
                </div>
            )}
            <TableScroller>
                <DataTable className="min-w-[1360px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("workload")}
                            >
                                Workload
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendors")}
                            >
                                Vendors
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                {...headerProps("gpuCount")}
                            >
                                GPUs
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Cost
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Actual cash outcome while consumed vendor credits cover part of GPU usage.",
                                        formula: "retained Paid − cash",
                                    }}
                                >
                                    Current · with credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Underlying GPU outcome after valuing consumed vendor credits as costs that may later require cash.",
                                        formula:
                                            "retained Paid − cash − consumed credit",
                                    }}
                                >
                                    Full cost · without credits
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("retainedUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash-backed Pollen used on this workload after owner, BYOP, and model payouts.",
                                        tables: "op_pollen_api",
                                    }}
                                >
                                    Retained Paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questUsd")}
                            >
                                <HeaderHint hint="Free Quest Pollen used on this workload; it is not fiat revenue.">
                                    Quest
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidCostUsd")}
                            >
                                Cash
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("creditCostUsd")}
                            >
                                Credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("totalCostUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Full resource cost before vendor credits reduce the cash bill.",
                                        formula: "cash + consumed credit",
                                    }}
                                >
                                    Total
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("currentResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentPerformancePct")}
                            >
                                <HeaderHint hint="Current result divided by retained Paid Pollen.">
                                    Performance
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("fullCostResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostPerformancePct")}
                            >
                                <HeaderHint hint="Full-cost result divided by retained Paid Pollen.">
                                    Performance
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) => row.key).map(
                            ({ key, row }) => {
                                const isExpanded = expanded.has(row.key);
                                return (
                                    <Fragment key={key}>
                                        <TableRow className="bg-theme-bg-subtle font-semibold">
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    aria-expanded={isExpanded}
                                                    disabled={
                                                        row.resources.length ===
                                                        0
                                                    }
                                                    onClick={() =>
                                                        toggle(row.key)
                                                    }
                                                    className="inline-flex items-center gap-1.5 text-left hover:text-theme-text disabled:cursor-default"
                                                >
                                                    <span className="text-theme-text-soft">
                                                        {row.resources
                                                            .length === 0
                                                            ? "·"
                                                            : isExpanded
                                                              ? "▾"
                                                              : "▸"}
                                                    </span>
                                                    {row.workload}
                                                </button>
                                                {row.flags.map((flag) => (
                                                    <span
                                                        key={flag}
                                                        className="ml-2 inline-flex"
                                                    >
                                                        <Chip
                                                            intent="warning"
                                                            size="sm"
                                                        >
                                                            {flag}
                                                        </Chip>
                                                    </span>
                                                ))}
                                            </TableCell>
                                            <TableCell>{row.vendors}</TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtNumber(row.gpuCount)}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={GROUP_BORDER}
                                            >
                                                {fmtUsd(row.retainedUsd)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(row.questUsd)}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={GROUP_BORDER}
                                            >
                                                {fmtUsd(row.paidCostUsd)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(row.creditCostUsd)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(row.totalCostUsd)}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={cn(
                                                    GROUP_BORDER,
                                                    signedToneOrSoft(
                                                        row.currentResultUsd,
                                                    ),
                                                )}
                                            >
                                                {fmtSignedUsd(
                                                    row.currentResultUsd,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.currentPerformancePct,
                                                )}
                                            >
                                                {fmtMarginPct(
                                                    row.currentPerformancePct,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={cn(
                                                    GROUP_BORDER,
                                                    signedToneOrSoft(
                                                        row.fullCostResultUsd,
                                                    ),
                                                )}
                                            >
                                                {fmtSignedUsd(
                                                    row.fullCostResultUsd,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.fullCostPerformancePct,
                                                )}
                                            >
                                                {fmtMarginPct(
                                                    row.fullCostPerformancePct,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {isExpanded &&
                                            row.resources.length > 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={12}
                                                        className="bg-theme-bg-active/40"
                                                    >
                                                        <GpuInstanceTable
                                                            rows={row.resources}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                    </Fragment>
                                );
                            },
                        )}
                        {sorted.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={12}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No GPU workloads for this selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
