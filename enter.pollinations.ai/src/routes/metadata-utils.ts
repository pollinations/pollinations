/**
 * Parse JSON metadata from a DB row.
 * Returns an empty object for null/undefined/invalid input.
 */
export function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

/**
 * Resolve the effective redirect URI allowlist for a `pk_` key.
 *
 * Reads the migrated `redirectUris: string[]` field. Legacy `appUrl` metadata
 * is removed by the D1 migration and is intentionally not used at runtime.
 */
export function getRedirectUris(meta: Record<string, unknown>): string[] {
    const list = meta.redirectUris;
    if (Array.isArray(list)) {
        return list.filter((v): v is string => typeof v === "string" && !!v);
    }
    return [];
}
