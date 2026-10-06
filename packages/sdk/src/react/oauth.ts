/**
 * Parse the OAuth authorization-code callback and validate its state.
 * PolliProvider performs the PKCE token exchange after this succeeds.
 */

export interface OAuthCallbackResult {
    /** URL with OAuth callback parameters removed. */
    cleanedUrl: string | null;
    /** Single-use authorization code from a valid callback. */
    code: string | null;
    /** OAuth error from a valid callback. */
    error: string | null;
    errorDescription: string | null;
    /** Whether callback state was absent or did not match the pending login. */
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
    error: null,
    errorDescription: null,
    invalidState: false,
};

export function consumeOAuthCallback(
    location: ReadOnlyLocation,
    storage: OAuthStorage,
    stateStorageKey: string,
): OAuthCallbackResult {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return EMPTY;

    const receivedState = params.get("state");
    const errorDescription = params.get("error_description");
    for (const key of ["code", "state", "error", "error_description"]) {
        params.delete(key);
    }
    const remaining = params.toString();
    const cleanedUrl = `${location.pathname}${remaining ? `?${remaining}` : ""}${location.hash}`;

    const expectedState = storage.getItem(stateStorageKey);
    if (!expectedState || receivedState !== expectedState) {
        return { ...EMPTY, cleanedUrl, invalidState: true };
    }

    storage.removeItem(stateStorageKey);
    return {
        ...EMPTY,
        cleanedUrl,
        code,
        error,
        errorDescription,
    };
}
