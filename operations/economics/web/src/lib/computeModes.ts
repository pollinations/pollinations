import type { Data } from "../types";
import { providerMeteringBasis } from "./providerRegistry";
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
    fallbackByProvider: Map<string, ComputeMode>;
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

function fallbackMode(
    provider: string,
    types: ReadonlySet<string>,
): ComputeMode {
    const observed = classifiedMode(types);
    if (observed !== "unclassified") {
        return observed === "mixed" ? "unclassified" : observed;
    }
    const basis = providerMeteringBasis(provider);
    if (basis === "direct") return "managed-inference";
    if (basis === "capacity") return "gpu-capacity";
    return "unclassified";
}

export function computeModeIndex(data: Data): ComputeModeIndex {
    const typesByProviderMonth = new Map<string, Set<string>>();
    const typesByProvider = new Map<string, Set<string>>();

    for (const row of data.opCloud ?? []) {
        const type = row.type.trim().toLowerCase();
        if (type !== "inference" && type !== "gpu") continue;
        const month = row.start.slice(0, 7);
        const provider = canonicalVendor(row.vendor);
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
        const providerTypes = typesByProvider.get(provider);
        if (providerTypes) providerTypes.add(type);
        else typesByProvider.set(provider, new Set([type]));
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

    const providers = new Set([
        ...typesByProvider.keys(),
        ...(data.opPollen ?? []).map((row) => canonicalVendor(row.vendor)),
    ]);
    const fallbackByProvider = new Map<string, ComputeMode>();
    for (const provider of providers) {
        fallbackByProvider.set(
            provider,
            fallbackMode(provider, typesByProvider.get(provider) ?? new Set()),
        );
    }

    return { fallbackByProvider, modeByProviderMonth, providerMonths };
}

export function providerMonthComputeMode(
    index: ComputeModeIndex,
    month: string,
    provider: string,
): ComputeMode {
    const canonical = canonicalVendor(provider);
    return (
        index.modeByProviderMonth.get(providerMonthKey(month, canonical)) ??
        index.fallbackByProvider.get(canonical) ??
        "unclassified"
    );
}

// Vendor unit economics includes every direct AI-delivery cost, regardless of
// whether the vendor supplied managed inference, GPU capacity, or both. Shared
// infrastructure stays in the ledger for P&L and operations, but never enters
// the vendor margin calculation.
export function directDeliveryData(data: Data): Data {
    return {
        ...data,
        opCloud: (data.opCloud ?? []).filter(
            (row) =>
                (row.type.trim().toLowerCase() === "inference" ||
                    row.type.trim().toLowerCase() === "gpu") &&
                canonicalVendor(row.vendor) !== "community",
        ),
        opPollen: (data.opPollen ?? []).filter(
            (row) => canonicalVendor(row.vendor) !== "community",
        ),
    };
}

// Managed inference gets only inference provider costs. Pollen stays out of a
// mixed provider-month so it cannot be counted again in the GPU view; the
// resulting provider-only row keeps the unresolved cost visible.
export function managedInferenceData(
    data: Data,
    index: ComputeModeIndex = computeModeIndex(data),
): Data {
    return {
        ...data,
        opCloud: (data.opCloud ?? []).filter(
            (row) =>
                row.type.trim().toLowerCase() === "inference" &&
                canonicalVendor(row.vendor) !== "community",
        ),
        opPollen: (data.opPollen ?? []).filter(
            (row) =>
                canonicalVendor(row.vendor) !== "community" &&
                providerMonthComputeMode(index, row.month, row.vendor) ===
                    "managed-inference",
        ),
    };
}
