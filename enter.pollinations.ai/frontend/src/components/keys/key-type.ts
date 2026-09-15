import type { ApiKey } from "./types.ts";

/**
 * Mirrors getRedirectUris in shared/auth/api-key-metadata.ts, the reader the
 * OAuth allowlist check uses. Keep the two in step: a URI the UI counts but
 * the server ignores (or the reverse) means a key is grouped and gated as
 * something the server does not agree it is.
 */
export function readRedirectUris(
    metadata: Record<string, unknown> | null | undefined,
): string[] {
    const list = metadata?.redirectUris;
    if (Array.isArray(list)) {
        return list.filter((v): v is string => typeof v === "string" && !!v);
    }
    return [];
}

export function isPublishableKey(apiKey: ApiKey): boolean {
    return apiKey.metadata?.keyType === "publishable";
}

export function isAppKey(apiKey: ApiKey): boolean {
    return (
        isPublishableKey(apiKey) &&
        (readRedirectUris(apiKey.metadata).length > 0 ||
            apiKey.metadata?.earningsEnabled === true)
    );
}

// Must mirror isPublishableKey, the predicate that decides whether the
// settings fields render — if this gate is narrower than that one, edits
// to a visible field get silently dropped.
export function shouldPostKeyMetadata(
    apiKey: ApiKey,
    next: { redirectUris: string[]; earningsEnabled: boolean },
): boolean {
    if (!isPublishableKey(apiKey)) return false;
    const initialUris = readRedirectUris(apiKey.metadata);
    return (
        next.redirectUris.length !== initialUris.length ||
        next.redirectUris.some((v, i) => v !== initialUris[i]) ||
        next.earningsEnabled !== (apiKey.metadata?.earningsEnabled === true)
    );
}
