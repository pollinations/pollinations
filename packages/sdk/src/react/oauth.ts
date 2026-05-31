/**
 * Pure OAuth callback parser. Extracted from PolliProvider so it can be
 * unit-tested without React.
 *
 * Reads `window.location.hash` for the `api_key` / `error` / `state`
 * fragment params that `enter.pollinations.ai/authorize` redirects back
 * with. Validates the `state` parameter against the value the client
 * persisted at login() time (CSRF protection), then signals to the caller
 * what to do.
 *
 * Validate-then-clear semantics: state is only cleared from storage when
 * the callback genuinely matches a pending login. A spoofed callback with
 * a wrong state must NOT clear stored state — otherwise an attacker could
 * DoS the real callback by planting a bad URL.
 */

export interface OAuthCallbackResult {
    /**
     * If auth params were present in the hash, the URL to replace
     * `window.location` with via `history.replaceState`. Strips the auth
     * params but preserves the route prefix (`#/dashboard`), any non-auth
     * hash params, pathname, and search.
     *
     * `null` when no auth params were present (no rewrite needed).
     */
    cleanedUrl: string | null;
    /** Valid api_key from a callback whose `state` matched. */
    apiKey: string | null;
    /** OAuth error code, if the callback was an error response. */
    error: string | null;
    errorDescription: string | null;
    /**
     * `true` when an `api_key` was present but `state` did not match.
     * Callers should warn but otherwise ignore (do NOT clear stored state).
     */
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
    apiKey: null,
    error: null,
    errorDescription: null,
    invalidState: false,
};

export function consumeOAuthCallback(
    location: ReadOnlyLocation,
    storage: OAuthStorage,
    stateStorageKey: string,
): OAuthCallbackResult {
    const rawHash = location.hash.startsWith("#")
        ? location.hash.slice(1)
        : location.hash;
    if (!rawHash) return EMPTY;

    // Hash-router apps use `#/route?param=…` — the route prefix sits before
    // the `?`, params after. Treating the whole hash as params would
    // mis-parse the route and the cleanup step below would strip it.
    const queryIdx = rawHash.indexOf("?");
    const routePrefix = queryIdx === -1 ? "" : rawHash.slice(0, queryIdx);
    const paramString = queryIdx === -1 ? rawHash : rawHash.slice(queryIdx + 1);
    const params = new URLSearchParams(paramString);

    const key = params.get("api_key");
    const error = params.get("error");
    const receivedState = params.get("state");
    const errorDescription = params.get("error_description");

    if (!key && !error) return EMPTY;

    for (const p of ["api_key", "state", "error", "error_description"]) {
        params.delete(p);
    }
    const remaining = params.toString();
    const newHash = remaining
        ? routePrefix
            ? `${routePrefix}?${remaining}`
            : remaining
        : routePrefix;
    const cleanedUrl =
        location.pathname + location.search + (newHash ? `#${newHash}` : "");

    if (key) {
        const expectedState = storage.getItem(stateStorageKey);
        if (!expectedState || receivedState !== expectedState) {
            return { ...EMPTY, cleanedUrl, invalidState: true };
        }
        storage.removeItem(stateStorageKey);
        return { ...EMPTY, cleanedUrl, apiKey: key };
    }

    // error branch
    const expectedState = storage.getItem(stateStorageKey);
    if (expectedState && receivedState === expectedState) {
        storage.removeItem(stateStorageKey);
    }
    return { ...EMPTY, cleanedUrl, error, errorDescription };
}
