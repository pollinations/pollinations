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

/** Display context only; authorization remains enforced by the server. */
export function getKeyAccessContext(
    apiKey: ApiKey,
): "app" | "device" | undefined {
    const { deviceUserCode, redirectOrigin } = apiKey.metadata ?? {};
    if (typeof deviceUserCode === "string" && deviceUserCode) return "device";
    if (
        apiKey.byopClientKeyId ||
        (typeof redirectOrigin === "string" && redirectOrigin)
    )
        return "app";
    return undefined;
}
