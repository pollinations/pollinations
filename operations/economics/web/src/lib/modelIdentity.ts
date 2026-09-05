import {
    getModels,
    getRegistryModelDefinition,
} from "../../../../../shared/registry/registry";
import { canonicalProvider, resolveProvider } from "./providerRegistry";

export type LabelResolution =
    | { kind: "blank" }
    | { kind: "model"; model: string }
    | { kind: "shared"; models: string[] }
    | { kind: "provider-only"; label: string }
    | { kind: "unmapped"; label: string };

const MODEL_IDS = new Set<string>(getModels());
// Each alias with the vendor that pays for the aliased model.
const ALIASES = new Map<string, { model: string; vendor: string }>();
for (const id of getModels()) {
    const definition = getRegistryModelDefinition(id);
    const vendor = canonicalProvider(definition.provider);
    for (const alias of definition.aliases) {
        if (!ALIASES.has(alias)) ALIASES.set(alias, { model: id, vendor });
    }
}

// A registry id is always itself. An alias joins only inside the provider
// that serves the aliased model: the same upstream name can be a different
// product, or a separately metered one, on another vendor.
export function canonicalPollenModel(vendor: string, model: string): string {
    const name = model.trim();
    if (MODEL_IDS.has(name)) return name;
    const alias = ALIASES.get(name);
    if (alias && alias.vendor === canonicalProvider(vendor)) return alias.model;
    return name;
}

// Ledger labels resolve in order: registry id, provider-scoped alias, then the
// reviewed label table of that provider. Anything else stays visibly unmapped.
export function resolveLedgerLabel(
    vendor: string,
    label: string,
): LabelResolution {
    const name = label.trim();
    if (!name) return { kind: "blank" };
    const provider = canonicalProvider(vendor);
    const canonical = canonicalPollenModel(provider, name);
    if (canonical !== name || MODEL_IDS.has(name)) {
        return { kind: "model", model: canonical };
    }
    const table = resolveProvider(provider)?.modelLabels ?? {};
    if (!Object.hasOwn(table, name)) return { kind: "unmapped", label: name };
    const target = table[name];
    if (target === null) return { kind: "provider-only", label: name };
    const models = [
        ...new Set(
            (Array.isArray(target) ? target : [target]).map((model) =>
                canonicalPollenModel(provider, model),
            ),
        ),
    ];
    return models.length === 1
        ? { kind: "model", model: models[0] }
        : { kind: "shared", models };
}
