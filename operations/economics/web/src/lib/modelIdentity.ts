import { getModels } from "../../../../../shared/registry/registry";
import type { Data, VendorLedgerRow } from "../types";
import {
    CANONICAL_MODEL_RENAMES,
    canonicalProvider,
    RETIRED_MODELS,
    resolveProvider,
} from "./providerRegistry";

export type LabelResolution =
    | { kind: "blank" }
    | { kind: "model"; model: string }
    | { kind: "shared"; models: string[] }
    | { kind: "provider-only"; label: string }
    | { kind: "unmapped"; label: string };

export type LabelQualifiers = {
    // Ledger resource_sku and resource_name, when a provider bills one label
    // under several line items that map to different Pollen models.
    sku?: string;
    name?: string;
    // Ledger month (YYYY-MM), for labels whose meaning changed over time.
    month?: string;
    // Exact identity observed at this provider and month; reviewed labels win.
    observedModel?: string;
};

// A dated rule pins a label to the Pollen id it billed during a period. Both
// bounds are inclusive months; a missing bound is open. Months no rule covers
// stay unmapped rather than guessed.
export type DatedLabelRule = {
    from?: string;
    until?: string;
    model: string | string[] | null;
};

export type ModelLabelTarget = string | string[] | null | DatedLabelRule[];

export function isDatedRules(
    target: ModelLabelTarget,
): target is DatedLabelRule[] {
    return (
        Array.isArray(target) &&
        target.length > 0 &&
        typeof target[0] === "object"
    );
}

// Preserve the release's former canonical IDs as accounting identities.
// Arbitrary live aliases remain excluded: they can change meaning over time.
const MODEL_IDS = new Set<string>([
    ...getModels(),
    ...RETIRED_MODELS,
    ...Object.keys(CANONICAL_MODEL_RENAMES),
    ...Object.values(CANONICAL_MODEL_RENAMES).flatMap((target) =>
        typeof target === "string"
            ? [target]
            : target.map((rule) => rule.model),
    ),
]);

// Resolves a provider ledger label through that provider's reviewed label
// table, or as itself when it is a registry model id. Pollen model ids are
// accounting identities as recorded. A qualified key ("label | sku" or
// "label | line item") wins over the bare label, and the table wins over
// the id so a reviewed split or shared upstream can override identity.
export function resolveLedgerLabel(
    vendor: string,
    label: string,
    qualifiers: LabelQualifiers = {},
): LabelResolution {
    const table = resolveProvider(canonicalProvider(vendor))?.modelLabels ?? {};
    let name = label.trim();
    if (!name) {
        // A line with no model label (a fee, a service line) joins only when
        // its SKU or line item is itself a reviewed label; it is never an id.
        const fallback = [qualifiers.sku, qualifiers.name]
            .map((qualifier) => qualifier?.trim() ?? "")
            .find(
                (qualifier) =>
                    qualifier !== "" && Object.hasOwn(table, qualifier),
            );
        if (!fallback) return { kind: "blank" };
        name = fallback;
    }
    const keys = [qualifiers.sku, qualifiers.name]
        .map((qualifier) => qualifier?.trim())
        .filter((qualifier): qualifier is string => Boolean(qualifier))
        .map((qualifier) => `${name} | ${qualifier}`);
    const key = [...keys, name].find((candidate) =>
        Object.hasOwn(table, candidate),
    );
    if (key === undefined) {
        return qualifiers.observedModel || MODEL_IDS.has(name)
            ? { kind: "model", model: qualifiers.observedModel ?? name }
            : { kind: "unmapped", label: name };
    }
    let target: ModelLabelTarget = table[key];
    if (isDatedRules(target)) {
        const month = qualifiers.month;
        const rule = month
            ? target.find(
                  (candidate) =>
                      (candidate.from ?? "") <= month &&
                      month <= (candidate.until ?? "9999-12"),
              )
            : undefined;
        if (!rule) return { kind: "unmapped", label: name };
        target = rule.model;
    }
    if (target === null) return { kind: "provider-only", label: name };
    if (Array.isArray(target)) {
        return { kind: "shared", models: target as string[] };
    }
    return { kind: "model", model: target };
}

// Source rows retain their original labels. Only reviewed exact identities are
// normalized; uncovered dates keep their source name for reconciliation.
export function canonicalModelName(
    month: string,
    vendor: string,
    id: string,
): string {
    const name = id.trim();
    const target = CANONICAL_MODEL_RENAMES[name];
    if (typeof target === "string") return target;
    return (
        target?.find(
            (rule) =>
                (!rule.provider ||
                    rule.provider === canonicalProvider(vendor)) &&
                rule.from <= month &&
                month <= (rule.until ?? "9999-12"),
        )?.model ?? name
    );
}

// One accounting identity resolver for provider, inference and GPU views.
export function ledgerModelResolver(data: Data) {
    const model = canonicalModelName;
    const observed = new Set(
        (data.opPollen ?? []).map(
            (row) =>
                `${row.month}|${canonicalProvider(row.vendor)}|${model(row.month, row.vendor, row.model)}`,
        ),
    );
    const unresolved = (month: string, vendor: string, id: string) =>
        !id.includes("/") && model(month, vendor, id) === id.trim();
    const resolveOne = (
        row: VendorLedgerRow,
        label: string,
    ): LabelResolution => {
        const month = row.start.slice(0, 7);
        const vendor = canonicalProvider(row.vendor);
        const id = model(month, vendor, label);
        let resolution = resolveLedgerLabel(vendor, label, {
            month,
            sku: row.resource_sku,
            name: row.resource_name,
            observedModel: observed.has(`${month}|${vendor}|${id}`)
                ? id
                : undefined,
        });
        if (resolution.kind === "model") {
            return {
                kind: "model",
                model: model(month, vendor, resolution.model),
            };
        }
        if (resolution.kind === "shared") {
            let models = [
                ...new Set(
                    resolution.models.map((id) => model(month, vendor, id)),
                ),
            ];
            const metered = models.filter((id) =>
                observed.has(`${month}|${vendor}|${id}`),
            );
            if (metered.length) models = metered;
            resolution =
                models.length === 1
                    ? { kind: "model", model: models[0] }
                    : { kind: "shared", models };
        }
        return resolution;
    };
    const ledger = (row: VendorLedgerRow): LabelResolution => {
        // GPU capacity may explicitly serve several workloads. Keep their cost
        // shared; never assign an unknown member's share to a known one.
        if (row.type === "gpu" && row.model.includes(",")) {
            const models: string[] = [];
            for (const label of row.model
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean)) {
                const resolved = resolveOne(row, label);
                if (resolved.kind === "model") models.push(resolved.model);
                else if (resolved.kind === "shared")
                    models.push(...resolved.models);
                else return { kind: "unmapped", label: row.model };
            }
            const unique = [...new Set(models)].sort();
            return unique.length === 1
                ? { kind: "model", model: unique[0] }
                : { kind: "shared", models: unique };
        }
        return resolveOne(row, row.model.trim());
    };
    return { model, ledger, unresolved };
}
