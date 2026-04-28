/**
 * Parse potentially double-serialized JSON metadata from a DB row.
 * Returns an empty object for null/undefined/invalid input.
 */
export function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Resolve the effective redirect URI allowlist for a `pk_` key.
 *
 * Reads the new `redirectUris: string[]` field, falling back to the legacy
 * single `appUrl` for keys created before the allowlist migration. Once all
 * write paths emit `redirectUris`, the fallback can be dropped.
 */
export function getRedirectUris(meta: Record<string, unknown>): string[] {
    const list = meta.redirectUris;
    if (Array.isArray(list)) {
        return list.filter((v): v is string => typeof v === "string" && !!v);
    }
    if (typeof meta.appUrl === "string" && meta.appUrl) return [meta.appUrl];
    return [];
}
