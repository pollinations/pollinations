/** Resolve explicit vendor IDs and aliases; unknown names stay unresolved. */
export function createProviderResolver<
    T extends { id: string; aliases: readonly string[] },
>(providers: readonly T[]) {
    const byName = new Map<string, T>();
    for (const provider of providers) {
        for (const name of [provider.id, ...provider.aliases]) {
            byName.set(name, provider);
        }
    }
    return (value: string): T | undefined =>
        byName.get(value.trim().toLowerCase());
}
