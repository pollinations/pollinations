export const API_KEY_TYPES = ["secret", "publishable"] as const;
export type ApiKeyType = (typeof API_KEY_TYPES)[number];

export const SECRET_API_KEY_PREFIX = "sk";
export const PUBLISHABLE_API_KEY_PREFIX = "pk";

export function parseApiKeyMetadata(
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

export function getApiKeyType(
    metadata: Record<string, unknown> | null | undefined,
): ApiKeyType {
    return metadata?.keyType === "publishable" ? "publishable" : "secret";
}

export function isPublishableKeyMetadata(
    metadata: Record<string, unknown> | null | undefined,
): boolean {
    return getApiKeyType(metadata) === "publishable";
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
