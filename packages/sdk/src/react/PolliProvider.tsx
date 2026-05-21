import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { AUTH_BASE_URL, Pollinations } from "../client.js";
import { PollinationsError } from "../types.js";
import {
    AuthActionsContext,
    type AuthActionsValue,
    AuthProfileContext,
    type AuthProfileValue,
    AuthStateContext,
    type AuthStateValue,
    type UserBalance,
    type UserProfile,
} from "./contexts.js";
import {
    resolveStorage,
    type StorageAdapter,
    type StorageOption,
} from "./storage.js";

export type { StorageAdapter, StorageOption } from "./storage.js";

export const DEFAULT_ENTER_URL = AUTH_BASE_URL;
export const DEFAULT_API_BASE_URL = `${AUTH_BASE_URL}/api`;
export const DEFAULT_PERMISSIONS: readonly string[] = ["profile", "usage"];

export interface PolliProviderProps {
    /**
     * Publishable key (`pk_...`): the app identifier, not a user's API key.
     */
    appKey: string;
    children: ReactNode;
    /**
     * Where to persist the user's session token. Defaults to `"localStorage"`.
     * Accepts `"sessionStorage"` or a custom synchronous `StorageAdapter`
     * (e.g. cookie-backed or in-memory). Async backends like IndexedDB or
     * React Native AsyncStorage are not currently supported — the interface
     * is sync because hydration runs in a `useEffect` and React Native
     * support isn't a stated target of this SDK.
     */
    storage?: StorageOption;
    /** OAuth scopes to request at login. Defaults to `["profile", "usage"]`. */
    permissions?: string[];
    /** Auth host. Defaults to `https://enter.pollinations.ai`. */
    enterUrl?: string;
    /** Account API host. Defaults to `https://enter.pollinations.ai/api`. */
    apiBaseUrl?: string;
}

function buildAuthUrl(
    enterUrl: string,
    appKey: string,
    permissions: readonly string[],
    redirectUrl: string,
    state: string,
): string {
    const params = new URLSearchParams({
        redirect_url: redirectUrl,
        app_key: appKey,
        permissions: permissions.join(","),
        state,
    });
    return `${enterUrl}/authorize?${params.toString()}`;
}

/**
 * Provides Pollinations auth state to descendants. Wrap your app once at the
 * root. Holds the user's API key, fetches profile + balance, and exposes hooks
 * for login / logout / consuming state.
 */
export function PolliProvider({
    appKey,
    children,
    storage: storageOption,
    permissions,
    enterUrl = DEFAULT_ENTER_URL,
    apiBaseUrl = DEFAULT_API_BASE_URL,
}: PolliProviderProps) {
    const storage = useMemo<StorageAdapter>(
        () => resolveStorage(storageOption),
        [storageOption],
    );
    const storageKey = `polli:${appKey}:token`;
    const stateStorageKey = `polli:${appKey}:oauth_state`;

    const resolvedPermissions = useMemo<readonly string[]>(
        () =>
            permissions && permissions.length > 0
                ? permissions
                : DEFAULT_PERMISSIONS,
        [permissions],
    );

    // SSR-safe: start null so server + client first paint agree.
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [balance, setBalance] = useState<UserBalance | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

    // Hydrate API key from storage + capture URL fragment after redirect.
    useEffect(() => {
        if (typeof window === "undefined") return;

        const hash = window.location.hash.substring(1);
        if (hash) {
            // Hash-router apps use `#/route?param=…` — the route prefix
            // sits before the `?`, params after. Treating the whole hash as
            // params would mis-parse the route and the cleanup step below
            // would strip it. If there's no `?`, fall back to the original
            // behavior (whole hash is the param string).
            const queryIdx = hash.indexOf("?");
            const routePrefix = queryIdx === -1 ? "" : hash.slice(0, queryIdx);
            const paramString =
                queryIdx === -1 ? hash : hash.slice(queryIdx + 1);
            const params = new URLSearchParams(paramString);
            const key = params.get("api_key");
            const error = params.get("error");
            const receivedState = params.get("state");
            // Capture before the cleanup loop deletes it from `params`.
            const errorDescription = params.get("error_description");
            if (key || error) {
                // Strip the auth params; keep the route and any non-auth
                // params the consumer was using.
                for (const p of [
                    "api_key",
                    "state",
                    "error",
                    "error_description",
                ]) {
                    params.delete(p);
                }
                const remaining = params.toString();
                const newHash = remaining
                    ? routePrefix
                        ? `${routePrefix}?${remaining}`
                        : remaining
                    : routePrefix;
                window.history.replaceState(
                    {},
                    "",
                    window.location.pathname +
                        window.location.search +
                        (newHash ? `#${newHash}` : ""),
                );
            }
            if (key) {
                // CSRF protection: only accept api_key responses that echo
                // back the `state` we generated at login(). A missing or
                // mismatched state means the redirect didn't originate from
                // a login this client started — reject the key and leave
                // stored state intact so any pending legit callback can
                // still complete (validate-then-clear, never clear-then-
                // validate, to avoid DoS via planted `#api_key=…&state=…`).
                const expectedState = storage.getItem(stateStorageKey);
                if (!expectedState || receivedState !== expectedState) {
                    console.warn(
                        "[PolliProvider] dropping auth response with missing or mismatched state",
                    );
                } else {
                    storage.removeItem(stateStorageKey);
                    storage.setItem(storageKey, key);
                    setApiKey(key);
                    return;
                }
            }
            if (error) {
                // Only clear stored state when the error response actually
                // matches our pending login — otherwise a spoofed
                // `#error=…&state=bogus` could wipe state and DoS the real
                // callback. Enter echoes `state` on the error branch too.
                const expectedState = storage.getItem(stateStorageKey);
                if (expectedState && receivedState === expectedState) {
                    storage.removeItem(stateStorageKey);
                }
                // OAuth rejected/cancelled — surface for debugging but don't
                // throw; consumers can still call login() again.
                console.warn(
                    `[PolliProvider] auth error: ${error}${
                        errorDescription ? ` — ${errorDescription}` : ""
                    }`,
                );
            }
        }

        const stored = storage.getItem(storageKey);
        if (stored) setApiKey(stored);
    }, [storageKey, stateStorageKey, storage]);

    const reqIdRef = useRef(0);

    // Synchronously invalidates in-flight profile/balance fetches and clears
    // session-derived state. Must be called BEFORE setApiKey(null) so any
    // already-resolved microtask sees the bumped reqIdRef and bails before
    // it can write back stale data.
    const clearSessionState = useCallback(() => {
        reqIdRef.current++;
        setProfile(null);
        setBalance(null);
        setIsLoadingProfile(false);
    }, []);

    useEffect(() => {
        if (!apiKey) {
            clearSessionState();
            return;
        }

        const reqId = ++reqIdRef.current;
        const client = new Pollinations({ apiKey, baseUrl: apiBaseUrl });

        const handle401 = () => {
            storage.removeItem(storageKey);
            clearSessionState();
            setApiKey(null);
        };

        (async () => {
            setIsLoadingProfile(true);
            try {
                const data = await client.accountProfile();
                if (reqId !== reqIdRef.current) return;
                setProfile(data);
            } catch (err) {
                if (reqId !== reqIdRef.current) return;
                if (err instanceof PollinationsError && err.status === 401) {
                    handle401();
                } else {
                    setProfile(null);
                }
            } finally {
                if (reqId === reqIdRef.current) setIsLoadingProfile(false);
            }
        })();

        (async () => {
            try {
                const data = await client.accountBalance();
                if (reqId !== reqIdRef.current) return;
                setBalance(data);
            } catch (err) {
                if (reqId !== reqIdRef.current) return;
                if (err instanceof PollinationsError && err.status === 401) {
                    handle401();
                } else {
                    setBalance(null);
                }
            }
        })();
    }, [apiKey, apiBaseUrl, storageKey, storage, clearSessionState]);

    const login = useCallback(
        (extraPermissions?: string[]) => {
            if (typeof window === "undefined") return;
            const currentUrl =
                window.location.href.split("#")[0] ?? window.location.href;
            const perms =
                extraPermissions && extraPermissions.length > 0
                    ? Array.from(
                          new Set([
                              ...resolvedPermissions,
                              ...extraPermissions,
                          ]),
                      )
                    : resolvedPermissions;
            const state = crypto.randomUUID();
            storage.setItem(stateStorageKey, state);
            window.location.href = buildAuthUrl(
                enterUrl,
                appKey,
                perms,
                currentUrl,
                state,
            );
        },
        [enterUrl, appKey, resolvedPermissions, storage, stateStorageKey],
    );

    const logout = useCallback(() => {
        storage.removeItem(storageKey);
        clearSessionState();
        setApiKey(null);
    }, [storage, storageKey, clearSessionState]);

    const stateValue = useMemo<AuthStateValue>(
        () => ({ apiKey, isLoggedIn: !!apiKey }),
        [apiKey],
    );

    const profileValue = useMemo<AuthProfileValue>(
        () => ({ profile, balance, isLoadingProfile }),
        [profile, balance, isLoadingProfile],
    );

    const actionsValue = useMemo<AuthActionsValue>(
        () => ({
            login,
            logout,
            permissions: resolvedPermissions,
            enterUrl,
        }),
        [login, logout, resolvedPermissions, enterUrl],
    );

    return (
        <AuthActionsContext.Provider value={actionsValue}>
            <AuthStateContext.Provider value={stateValue}>
                <AuthProfileContext.Provider value={profileValue}>
                    {children}
                </AuthProfileContext.Provider>
            </AuthStateContext.Provider>
        </AuthActionsContext.Provider>
    );
}
