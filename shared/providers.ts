import registry from "../operations/economics/provider-registry.json";

// Economics owns vendor identities. Model-provider validation uses the same
// explicit aliases without changing the provider tags written to usage events.
const providerIds = new Map<string, string>();
for (const provider of registry.providers) {
    for (const name of [provider.id, ...provider.aliases]) {
        providerIds.set(name, provider.id);
    }
}

/** Unknown names stay unresolved so callers can reject or report mapping gaps. */
export function resolveProviderId(value: string): string | undefined {
    return providerIds.get(value.trim().toLowerCase());
}
