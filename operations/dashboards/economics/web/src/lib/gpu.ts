import type { Data, VendorLedgerRow } from "../types";
import { computeModeIndex, pollenComputeMode } from "./computeModes";
import { toUsd } from "./fx";
import { ledgerModelResolver } from "./modelIdentity";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "./months";
import { canonicalVendor } from "./tb";
import {
    vendorLedgerCreditBurnUsd,
    vendorLedgerMonth,
    vendorLedgerPaidBurnUsd,
} from "./vendorLedger";
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

type GpuWorkloadSummary = {
    paidUsd: number;
    questUsd: number;
    retainedUsd: number;
    paidCostUsd: number;
    creditCostUsd: number;
    currentResultUsd: number | null;
    currentPerformancePct: number | null;
    fullCostResultUsd: number | null;
    fullCostPerformancePct: number | null;
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
    /refund|grant|promo|credit|settlement|reconcil|account total|billing-history|startup program|top.?up|storage/i;

function usageKind(row: VendorLedgerRow): UsageKind | null {
    return USAGE_KIND_BY_SKU[row.resource_sku.trim().toLowerCase()] ?? null;
}

function isFinancialOrAggregateRow(row: VendorLedgerRow): boolean {
    if (usageKind(row)) return false;
    return NON_RESOURCE_PATTERN.test(
        `${row.resource_id} ${row.resource_name} ${row.resource_sku}`,
    );
}

function cleanResourceName(
    vendor: string,
    resourceId: string,
    names: readonly string[],
): string {
    if (vendor === "vast" && resourceId) return `#${resourceId}`;
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
        hasNonAdjustment: boolean;
        legacyGpuHours: number;
        paidCostUsd: number;
        creditCostUsd: number;
    };

    const groups = new Map<string, ResourceAcc>();
    const identity = ledgerModelResolver(data);

    for (const row of data.vendorLedger ?? []) {
        const vendor = canonicalVendor(row.vendor);
        if (row.type !== "gpu" || vendor === "community") continue;
        const month = vendorLedgerMonth(row);
        if (month < WINDOW_START || !matchesMonth(month, monthFilter)) {
            continue;
        }

        const paidCostUsd = vendorLedgerPaidBurnUsd(row);
        const creditCostUsd = vendorLedgerCreditBurnUsd(row);
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
            hasNonAdjustment: false,
            legacyGpuHours: 0,
            paidCostUsd: 0,
            creditCostUsd: 0,
        };

        const kind = usageKind(row);
        const rowIsAdjustment = isFinancialOrAggregateRow(row);
        const quantity = Math.max(0, Number(row.resource_count) || 0);
        acc.paidCostUsd += paidCostUsd;
        acc.creditCostUsd += creditCostUsd;
        acc.hasPositiveCost ||= totalCostUsd > 0;
        acc.hasNonAdjustment ||= !rowIsAdjustment;
        if (row.resource_name.trim()) acc.names.add(row.resource_name.trim());
        if (row.resource_sku.trim()) acc.hardware.add(row.resource_sku.trim());
        const resolution = identity.ledger(row);
        const models =
            resolution.kind === "model"
                ? [resolution.model]
                : resolution.kind === "shared"
                  ? resolution.models
                  : row.model.includes(",")
                    ? []
                    : splitModels(row.model);
        for (const model of models) acc.models.add(model);

        if (kind && !rowIsAdjustment) acc.hasStructuredUsage = true;
        if (kind === "gpu" && !rowIsAdjustment) {
            acc.gpuHours += quantity;
            acc.hasGpuHours = true;
        } else if (kind === "storage" && !rowIsAdjustment) {
            acc.storageHours += quantity;
            acc.hasStorageHours = true;
        } else if (
            (kind === "download" || kind === "upload") &&
            !rowIsAdjustment
        ) {
            acc.networkGb += quantity;
            acc.hasNetwork = true;
        } else if (
            LEGACY_HOURLY_VENDORS.has(vendor) &&
            !rowIsAdjustment &&
            quantity > 0
        ) {
            acc.legacyGpuHours += quantity;
        }

        groups.set(key, acc);
    }

    const gpuRows: GpuResourceRow[] = [];
    const overheadByVendorMonth = new Map<
        string,
        GpuResourceRow & { resourceIds: Set<string> }
    >();

    for (const acc of groups.values()) {
        const legacyGpuHours =
            !acc.hasStructuredUsage && acc.hasNonAdjustment
                ? acc.legacyGpuHours
                : 0;
        const isGpu =
            acc.hasGpuHours ||
            legacyGpuHours > 0 ||
            (!acc.hasStructuredUsage &&
                Boolean(acc.resourceId) &&
                acc.hasPositiveCost &&
                acc.hasNonAdjustment);
        const totalCostUsd = acc.paidCostUsd + acc.creditCostUsd;

        if (isGpu) {
            const gpuHours = acc.hasGpuHours
                ? acc.gpuHours
                : legacyGpuHours > 0
                  ? legacyGpuHours
                  : null;
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
        missingCost: boolean;
        ambiguous: boolean;
    };

    const identity = ledgerModelResolver(data);

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
            missingCost: false,
            ambiguous: false,
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
            pollenComputeMode(modeIndex, pollen.month, vendor, pollen.model) !==
                "gpu-capacity"
        ) {
            continue;
        }

        const model =
            identity.model(pollen.month, vendor, pollen.model) ||
            "Unassigned Pollen model";
        const exact = groups.get(workloadKey([model]));
        const containing = [...groups.values()].filter(
            (group) =>
                group.kind === "workload" &&
                group.models.has(model) &&
                group.resources.some(
                    (resource) =>
                        resource.vendor === vendor &&
                        resource.month === pollen.month,
                ),
        );
        const group =
            containing.length === 1
                ? containing[0]
                : (exact ?? ensure(workloadKey([model]), "workload", [model]));
        if (containing.length > 1) {
            for (const candidate of containing) candidate.ambiguous = true;
            group.ambiguous = true;
        }
        if (
            !group.resources.some(
                (resource) =>
                    resource.vendor === vendor &&
                    resource.month === pollen.month,
            )
        )
            group.missingCost = true;
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
                : group.kind === "workload" &&
                    group.hasPollen &&
                    group.hasCost &&
                    !group.missingCost &&
                    !group.ambiguous
                  ? group.retainedUsd - group.paidCostUsd
                  : null;
        const fullCostResultUsd =
            group.kind === "overhead"
                ? -totalCostUsd
                : group.kind === "workload" &&
                    group.hasPollen &&
                    group.hasCost &&
                    !group.missingCost &&
                    !group.ambiguous
                  ? group.retainedUsd - totalCostUsd
                  : null;
        const flags: string[] = [];
        if (group.kind === "unassigned") flags.push("unmapped");
        if (group.ambiguous) flags.push("ambiguous workload allocation");
        if (group.kind === "workload" && !group.hasPollen && !group.ambiguous) {
            flags.push("missing Pollen");
        }
        if (
            group.kind === "workload" &&
            (!group.hasCost || group.missingCost)
        ) {
            flags.push("missing GPU cost");
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

export function gpuWorkloadSummary(
    rows: readonly GpuWorkloadRow[],
): GpuWorkloadSummary {
    const summary = rows.reduce(
        (total, row) => {
            total.paidUsd += row.paidUsd ?? 0;
            total.questUsd += row.questUsd ?? 0;
            total.retainedUsd += row.retainedUsd ?? 0;
            total.paidCostUsd += row.paidCostUsd;
            total.creditCostUsd += row.creditCostUsd;
            return total;
        },
        {
            paidUsd: 0,
            questUsd: 0,
            retainedUsd: 0,
            paidCostUsd: 0,
            creditCostUsd: 0,
        },
    );
    const complete =
        rows.length > 0 && rows.every((row) => row.flags.length === 0);
    const currentResultUsd = complete
        ? summary.retainedUsd - summary.paidCostUsd
        : null;
    const fullCostResultUsd = complete
        ? summary.retainedUsd - summary.paidCostUsd - summary.creditCostUsd
        : null;
    return {
        ...summary,
        currentResultUsd,
        currentPerformancePct:
            currentResultUsd != null && summary.retainedUsd > 0
                ? (currentResultUsd / summary.retainedUsd) * 100
                : null,
        fullCostResultUsd,
        fullCostPerformancePct:
            fullCostResultUsd != null && summary.retainedUsd > 0
                ? (fullCostResultUsd / summary.retainedUsd) * 100
                : null,
    };
}
