import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import type { AccountPermission } from "../types.js";
import {
    AuthContext,
    type AuthContextValue,
    type AuthorizeRequest,
} from "./contexts.js";
import { consumeOAuthCallback } from "./oauth.js";
import {
    resolveStorage,
    type StorageAdapter,
    type StorageOption,
} from "./storage.js";

export type { AuthorizeRequest } from "./contexts.js";
export type { StorageAdapter, StorageOption } from "./storage.js";

export const DEFAULT_ENTER_URL = "https://enter.pollinations.ai";

export interface PolliProviderProps {
    /** Publishable key (`pk_...`): the app identifier, not a user's API key. */
    appKey: string;
    children: ReactNode;
    /**
     * Where to persist the user's session token. Defaults to `"localStorage"`.
     * Accepts `"sessionStorage"` or a custom synchronous `StorageAdapter`
     * (e.g. cookie-backed or in-memory). Async backends like IndexedDB or
     * React Native AsyncStorage are not supported — the interface is sync
     * because hydration runs in a `useEffect`.
     */
    storage?: StorageOption;
    /** OAuth scopes to request at login. Defaults to no optional account scopes. */
    permissions?: AccountPermission[];
    /**
     * Default model slugs to request access to (BYOP). Empty / undefined means
     * "all models". Per-call `login({ models })` overrides this.
     */
    models?: string[];
    /**
     * Default pollen budget to request for the minted key. Per-call
     * `login({ budget })` overrides this.
     */
    budget?: number;
    /**
     * Default key lifetime in days. Per-call `login({ expiry })` overrides this.
     */
    expiry?: number;
    /** Auth host. Defaults to `https://enter.pollinations.ai`. */
    enterUrl?: string;
    /** Account API host. Derived from `enterUrl + "/api"` unless explicitly set. */
    apiBaseUrl?: string;
}

function buildAuthorizeUrl(args: {
    enterUrl: string;
    appKey: string;
    permissions: readonly AccountPermission[];
    redirectUrl: string;
    state: string;
    models?: readonly string[];
    budget?: number;
    expiry?: number;
}): string {
    const params = new URLSearchParams();
    params.set("redirect_uri", args.redirectUrl);
    params.set("client_id", args.appKey);
    params.set("state", args.state);
    if (args.permissions.length > 0) {
        params.set("scope", args.permissions.join(" "));
    }
    if (args.models && args.models.length > 0) {
        params.set("models", args.models.join(","));
    }
    if (args.budget !== undefined) {
        params.set("budget", String(args.budget));
    }
    if (args.expiry !== undefined) {
        params.set("expiry", String(args.expiry));
    }
    return `${args.enterUrl}/authorize?${params.toString()}`;
}

/**
 * Provides Pollinations auth state to descendants. Wrap your app once at the
 * root. Holds the delegated API key, handles the OAuth callback, and exposes
 * login/logout. Account data is fetched by opt-in hooks so apps only request
 * the data they render.
 */
export function PolliProvider({
    appKey,
    children,
    storage: storageOption,
    permissions,
    models: defaultModels,
    budget: defaultBudget,
    expiry: defaultExpiry,
    enterUrl = DEFAULT_ENTER_URL,
    apiBaseUrl,
}: PolliProviderProps) {
    const storage = useMemo<StorageAdapter>(
        () => resolveStorage(storageOption),
        [storageOption],
    );
    const resolvedApiBaseUrl = apiBaseUrl ?? `${enterUrl}/api`;
    const storageKey = `polli:${appKey}:token`;
    const stateStorageKey = `polli:${appKey}:oauth_state`;

    const defaultPermissions = useMemo<readonly AccountPermission[]>(
        () => permissions ?? [],
        [permissions],
    );

    // SSR-safe: start null so server + client first paint agree.
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const updateApiKey = useCallback(
        (nextApiKey: string | null) => {
            if (nextApiKey) {
                storage.setItem(storageKey, nextApiKey);
            } else {
                storage.removeItem(storageKey);
            }
            setApiKey(nextApiKey);
            setError(null);
        },
        [storage, storageKey],
    );

    // Hydrate API key from storage + capture URL fragment after redirect.
    useEffect(() => {
        if (typeof window === "undefined") {
            setIsHydrated(true);
            return;
        }

        const result = consumeOAuthCallback(
            window.location,
            storage,
            stateStorageKey,
        );
        if (result.cleanedUrl) {
            window.history.replaceState({}, "", result.cleanedUrl);
        }
        if (result.invalidState) {
            console.warn(
                "[PolliProvider] dropping auth response with missing or mismatched state",
            );
            setError(new Error("Invalid OAuth state"));
        }
        if (result.error) {
            console.warn(
                `[PolliProvider] auth error: ${result.error}${
                    result.errorDescription
                        ? ` — ${result.errorDescription}`
                        : ""
                }`,
            );
            setError(new Error(result.errorDescription ?? result.error));
        }
        if (result.apiKey) {
            updateApiKey(result.apiKey);
            setIsHydrated(true);
            return;
        }
        const stored = storage.getItem(storageKey);
        if (stored) setApiKey(stored);
        setIsHydrated(true);
    }, [stateStorageKey, storage, updateApiKey, storageKey]);

    const login = useCallback(
        (request?: AuthorizeRequest) => {
            if (typeof window === "undefined") return;
            const currentUrl =
                window.location.href.split("#")[0] ?? window.location.href;
            const extraPermissions = request?.permissions;
            const perms: AccountPermission[] =
                extraPermissions && extraPermissions.length > 0
                    ? Array.from(
                          new Set([...defaultPermissions, ...extraPermissions]),
                      )
                    : [...defaultPermissions];
            const state = crypto.randomUUID();
            storage.setItem(stateStorageKey, state);
            window.location.href = buildAuthorizeUrl({
                enterUrl,
                appKey,
                permissions: perms,
                redirectUrl: currentUrl,
                state,
                models: request?.models ?? defaultModels,
                budget: request?.budget ?? defaultBudget,
                expiry: request?.expiry ?? defaultExpiry,
            });
        },
        [
            enterUrl,
            appKey,
            defaultPermissions,
            storage,
            stateStorageKey,
            defaultModels,
            defaultBudget,
            defaultExpiry,
        ],
    );

    const logout = useCallback(() => {
        updateApiKey(null);
    }, [updateApiKey]);

    const authValue = useMemo<AuthContextValue>(
        () => ({
            apiKey,
            isLoggedIn: !!apiKey,
            isHydrated,
            error,
            login,
            logout,
            setApiKey: updateApiKey,
            enterUrl,
            apiBaseUrl: resolvedApiBaseUrl,
        }),
        [
            apiKey,
            isHydrated,
            error,
            login,
            logout,
            updateApiKey,
            enterUrl,
            resolvedApiBaseUrl,
        ],
    );

    return (
        <AuthContext.Provider value={authValue}>
            {children}
        </AuthContext.Provider>
    );
}
