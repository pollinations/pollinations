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
};

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
    const target = table[key];
    if (target === null) return { kind: "provider-only", label: name };
    if (Array.isArray(target)) return { kind: "shared", models: target };
    return { kind: "model", model: target };
}
