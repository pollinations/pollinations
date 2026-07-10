/**
 * Pure OAuth authorization-code callback parser for PolliProvider.
 *
 * The pending PKCE verifier stays in the configured storage while Pollinations
 * handles consent. On return, this validates state, removes OAuth query
 * parameters from the URL, and gives the provider the values needed for the
 * token exchange.
 */

export interface PendingAuthorization {
    state: string;
    codeVerifier: string;
    redirectUri: string;
}

export interface OAuthCallbackResult {
    cleanedUrl: string | null;
    code: string | null;
    codeVerifier: string | null;
    redirectUri: string | null;
    error: string | null;
    errorDescription: string | null;
    invalidState: boolean;
}

interface ReadOnlyLocation {
    hash: string;
    pathname: string;
    search: string;
}

interface OAuthStorage {
    getItem(key: string): string | null;
    removeItem(key: string): void;
}

const EMPTY: OAuthCallbackResult = {
    cleanedUrl: null,
    code: null,
    codeVerifier: null,
    redirectUri: null,
    error: null,
    errorDescription: null,
    invalidState: false,
};

function readPendingAuthorization(
    storage: OAuthStorage,
    pendingStorageKey: string,
): PendingAuthorization | null {
    const raw = storage.getItem(pendingStorageKey);
    if (!raw) return null;
    try {
        const pending = JSON.parse(raw) as Partial<PendingAuthorization>;
        if (
            typeof pending.state !== "string" ||
            typeof pending.codeVerifier !== "string" ||
            typeof pending.redirectUri !== "string"
        ) {
            return null;
        }
        return pending as PendingAuthorization;
    } catch {
        return null;
    }
}

export function consumeOAuthCallback(
    location: ReadOnlyLocation,
    storage: OAuthStorage,
    pendingStorageKey: string,
): OAuthCallbackResult {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return EMPTY;

    const receivedState = params.get("state");
    const errorDescription = params.get("error_description");
    for (const param of ["code", "state", "error", "error_description"]) {
        params.delete(param);
    }
    const remaining = params.toString();
    const cleanedUrl =
        location.pathname + (remaining ? `?${remaining}` : "") + location.hash;
    const pending = readPendingAuthorization(storage, pendingStorageKey);

    if (code) {
        if (!pending || receivedState !== pending.state) {
            return { ...EMPTY, cleanedUrl, invalidState: true };
        }
        return {
            ...EMPTY,
            cleanedUrl,
            code,
            codeVerifier: pending.codeVerifier,
            redirectUri: pending.redirectUri,
        };
    }

    if (!pending || receivedState !== pending.state) {
        return { ...EMPTY, cleanedUrl, invalidState: true };
    }
    storage.removeItem(pendingStorageKey);
    return { ...EMPTY, cleanedUrl, error, errorDescription };
}
