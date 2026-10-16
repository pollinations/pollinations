import type { Data, VendorLedgerRow } from "../types";
import { ledgerModelResolver } from "./modelIdentity";
import {
    POLLEN_COMPUTE_MODE_OVERRIDES,
    resolveProvider,
} from "./providerRegistry";
import { canonicalVendor } from "./tb";

export type ComputeMode =
    | "managed-inference"
    | "gpu-capacity"
    | "mixed"
    | "unclassified";

export type ComputeModeProviderMonth = {
    month: string;
    provider: string;
    mode: ComputeMode;
};

export type ComputeModeIndex = {
    providerMonths: ComputeModeProviderMonth[];
    modeByProviderMonth: Map<string, ComputeMode>;
    modeByModel: Map<string, ComputeMode>;
    model: ReturnType<typeof ledgerModelResolver>["model"];
};

function providerMonthKey(month: string, provider: string): string {
    return `${month}|${canonicalVendor(provider)}`;
}

function classifiedMode(types: ReadonlySet<string>): ComputeMode {
    const inference = types.has("inference");
    const gpu = types.has("gpu");
    if (inference && gpu) return "mixed";
    if (inference) return "managed-inference";
    if (gpu) return "gpu-capacity";
    return "unclassified";
}

function carriesComputeCost(row: VendorLedgerRow) {
    return Math.abs(Number(row.paid)) > 0.0001 || Number(row.credit) < -0.0001;
}

export function computeModeIndex(data: Data): ComputeModeIndex {
    const typesByProviderMonth = new Map<string, Set<string>>();
    const typesByModel = new Map<string, Set<string>>();
    const identity = ledgerModelResolver(data);

    for (const row of data.vendorLedger ?? []) {
        const type = row.type.trim().toLowerCase();
        if (type !== "inference" && type !== "gpu") continue;
        if (!carriesComputeCost(row)) continue;
        const month = row.start.slice(0, 7);
        const provider = canonicalVendor(row.vendor);
        const resolution = identity.ledger(row);
        const models =
            resolution.kind === "model"
                ? [resolution.model]
                : resolution.kind === "shared"
                  ? resolution.models
                  : [];
        for (const model of models) {
            const key = `${providerMonthKey(month, provider)}|${model}`;
            const types = typesByModel.get(key) ?? new Set<string>();
            types.add(type);
            typesByModel.set(key, types);
        }
        const monthTypes = typesByProviderMonth.get(
            providerMonthKey(month, provider),
        );
        if (monthTypes) monthTypes.add(type);
        else {
            typesByProviderMonth.set(
                providerMonthKey(month, provider),
                new Set([type]),
            );
        }
    }

    const modeByProviderMonth = new Map<string, ComputeMode>();
    const providerMonths = [...typesByProviderMonth]
        .map(([key, types]): ComputeModeProviderMonth => {
            const separator = key.indexOf("|");
            const month = key.slice(0, separator);
            const provider = key.slice(separator + 1);
            const mode = classifiedMode(types);
            modeByProviderMonth.set(key, mode);
            return { month, provider, mode };
        })
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                a.provider.localeCompare(b.provider),
        );

    return {
        modeByProviderMonth,
        providerMonths,
        modeByModel: new Map(
            [...typesByModel].map(([key, types]) => [
                key,
                classifiedMode(types),
            ]),
        ),
        model: identity.model,
    };
}

export function providerMonthComputeMode(
    index: ComputeModeIndex,
    month: string,
    provider: string,
): ComputeMode {
    const canonical = canonicalVendor(provider);
    return (
        index.modeByProviderMonth.get(providerMonthKey(month, canonical)) ??
        "unclassified"
    );
}

// Missing bills do not erase usage from a known API provider. Keep observed
// mixed/GPU months authoritative; use reviewed routing only when costs are absent.
export function pollenComputeMode(
    index: ComputeModeIndex,
    month: string,
    provider: string,
    model?: string,
): ComputeMode {
    const observed = providerMonthComputeMode(index, month, provider);
    // Reviewed routing can resolve delivery without inventing a GPU cost split.
    const reviewed = POLLEN_COMPUTE_MODE_OVERRIDES.find(
        (rule) =>
            rule.vendor === canonicalVendor(provider) &&
            rule.model === model &&
            rule.from <= month &&
            month <= rule.until,
    )?.mode;
    if (observed === "mixed" && model !== undefined) {
        return (
            index.modeByModel.get(
                `${providerMonthKey(month, provider)}|${index.model(month, provider, model)}`,
            ) ??
            reviewed ??
            "mixed"
        );
    }
    if (observed !== "unclassified") return observed;
    const definition = resolveProvider(provider);
    return (
        reviewed ??
        definition?.pollenComputeMode ??
        (definition?.category === "compute" &&
        definition.meteringBasis === "direct"
            ? "managed-inference"
            : "unclassified")
    );
}

// Vendor unit economics includes every direct AI-delivery cost, regardless of
// whether the vendor supplied managed inference, GPU capacity, or both. Shared
// infrastructure stays in the ledger for P&L and operations, but never enters
// the vendor margin calculation.
export function directDeliveryData(data: Data): Data {
    return {
        ...data,
        vendorLedger: (data.vendorLedger ?? []).filter(
            (row) =>
                (row.type.trim().toLowerCase() === "inference" ||
                    row.type.trim().toLowerCase() === "gpu") &&
                canonicalVendor(row.vendor) !== "community",
        ),
        opPollen: (data.opPollen ?? []).filter(
            (row) =>
                canonicalVendor(row.vendor) !== "community" &&
                resolveProvider(row.vendor)?.category !== "infrastructure",
        ),
    };
}

// In mixed months, include only usage matched to inference costs. Ambiguous
// models remain unallocated instead of appearing in both delivery views.
export function managedInferenceData(
    data: Data,
    index: ComputeModeIndex = computeModeIndex(data),
): Data {
    return {
        ...data,
        vendorLedger: (data.vendorLedger ?? []).filter(
            (row) =>
                row.type.trim().toLowerCase() === "inference" &&
                canonicalVendor(row.vendor) !== "community",
        ),
        opPollen: (data.opPollen ?? []).filter(
            (row) =>
                canonicalVendor(row.vendor) !== "community" &&
                pollenComputeMode(index, row.month, row.vendor, row.model) ===
                    "managed-inference",
        ),
    };
}
