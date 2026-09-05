import { getModels } from "../../../../../shared/registry/registry";
import { canonicalProvider, resolveProvider } from "./providerRegistry";

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

// Current registry ids only. Aliases are deliberately excluded: today's alias
// of a model must not rewrite which model a historical cost belonged to.
const MODEL_IDS = new Set<string>(getModels());

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
    const name = label.trim();
    if (!name) return { kind: "blank" };
    const table = resolveProvider(canonicalProvider(vendor))?.modelLabels ?? {};
    const keys = [qualifiers.sku, qualifiers.name]
        .map((qualifier) => qualifier?.trim())
        .filter((qualifier): qualifier is string => Boolean(qualifier))
        .map((qualifier) => `${name} | ${qualifier}`);
    const key = [...keys, name].find((candidate) =>
        Object.hasOwn(table, candidate),
    );
    if (key === undefined) {
        return MODEL_IDS.has(name)
            ? { kind: "model", model: name }
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
