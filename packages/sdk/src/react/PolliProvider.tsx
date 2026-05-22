import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { AUTH_BASE_URL, Pollinations } from "../client.js";
import {
    AuthActionsContext,
    type AuthActionsValue,
    AuthClientContext,
    AuthKeyContext,
    type AuthKeyValue,
    type AuthorizeRequest,
    AuthProfileContext,
    type AuthProfileValue,
    AuthStateContext,
    type AuthStateValue,
} from "./contexts.js";
import { useResource } from "./hooks.js";
import { consumeOAuthCallback } from "./oauth.js";
import {
    resolveStorage,
    type StorageAdapter,
    type StorageOption,
} from "./storage.js";

export type { AuthorizeRequest } from "./contexts.js";
export type { StorageAdapter, StorageOption } from "./storage.js";

export const DEFAULT_ENTER_URL = AUTH_BASE_URL;
export const DEFAULT_PERMISSIONS: readonly string[] = ["profile", "usage"];

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
    /** OAuth scopes to request at login. Defaults to `["profile", "usage"]`. */
    permissions?: string[];
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

function buildAuthUrl(args: {
    enterUrl: string;
    appKey: string;
    permissions: readonly string[];
    redirectUrl: string;
    state: string;
    models?: readonly string[];
    budget?: number;
    expiry?: number;
}): string {
    const params = new URLSearchParams({
        redirect_uri: args.redirectUrl,
        client_id: args.appKey,
        scope: args.permissions.join(" "),
        state: args.state,
    });
    if (args.models && args.models.length > 0) {
        params.set("models", args.models.join(","));
    }
    if (typeof args.budget === "number") {
        params.set("budget", String(args.budget));
    }
    if (typeof args.expiry === "number") {
        params.set("expiry", String(args.expiry));
    }
    return `${args.enterUrl}/authorize?${params.toString()}`;
}

/**
 * Provides Pollinations auth state to descendants. Wrap your app once at the
 * root. Holds the user's API key, fetches profile + balance + key info, and
 * exposes hooks for login / logout / consuming state.
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

    const initialPermissions = useMemo<readonly string[]>(
        () =>
            permissions && permissions.length > 0
                ? permissions
                : DEFAULT_PERMISSIONS,
        [permissions],
    );

    // SSR-safe: start null so server + client first paint agree.
    const [apiKey, setApiKey] = useState<string | null>(null);

    const client = useMemo(
        () =>
            apiKey
                ? new Pollinations({ apiKey, baseUrl: resolvedApiBaseUrl })
                : null,
        [apiKey, resolvedApiBaseUrl],
    );

    // Hydrate API key from storage + capture URL fragment after redirect.
    useEffect(() => {
        if (typeof window === "undefined") return;

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
        }
        if (result.error) {
            console.warn(
                `[PolliProvider] auth error: ${result.error}${
                    result.errorDescription
                        ? ` — ${result.errorDescription}`
                        : ""
                }`,
            );
        }
        if (result.apiKey) {
            storage.setItem(storageKey, result.apiKey);
            setApiKey(result.apiKey);
            return;
        }
        const stored = storage.getItem(storageKey);
        if (stored) setApiKey(stored);
    }, [storageKey, stateStorageKey, storage]);

    const handleUnauthorized = useCallback(() => {
        storage.removeItem(storageKey);
        setApiKey(null);
    }, [storage, storageKey]);

    const fetchProfile = useCallback(
        (c: Pollinations) => c.accountProfile(),
        [],
    );
    const fetchBalance = useCallback(
        (c: Pollinations) => c.accountBalance(),
        [],
    );
    const fetchKey = useCallback((c: Pollinations) => c.validateKey(), []);

    const profileResource = useResource(
        client,
        fetchProfile,
        handleUnauthorized,
    );
    const balanceResource = useResource(
        client,
        fetchBalance,
        handleUnauthorized,
    );
    const keyResource = useResource(client, fetchKey, handleUnauthorized);

    const refreshProfile = profileResource.refresh;
    const refreshBalance = balanceResource.refresh;
    const refreshKey = keyResource.refresh;

    const refreshAuth = useCallback(async () => {
        await Promise.all([refreshKey(), refreshProfile(), refreshBalance()]);
    }, [refreshKey, refreshProfile, refreshBalance]);

    // Whenever the client identity changes (login, logout, key rotation) the
    // three resources' refresh callbacks change identity too — re-run them.
    useEffect(() => {
        void refreshAuth();
    }, [refreshAuth]);

    const grantedPermissions = useMemo<readonly string[]>(
        () => keyResource.data?.permissions?.account ?? [],
        [keyResource.data],
    );

    const login = useCallback(
        (request?: AuthorizeRequest) => {
            if (typeof window === "undefined") return;
            const currentUrl =
                window.location.href.split("#")[0] ?? window.location.href;
            const basePermissions =
                grantedPermissions.length > 0
                    ? grantedPermissions
                    : initialPermissions;
            const extraPermissions = request?.permissions;
            const perms =
                extraPermissions && extraPermissions.length > 0
                    ? Array.from(
                          new Set([...basePermissions, ...extraPermissions]),
                      )
                    : basePermissions;
            const state = crypto.randomUUID();
            storage.setItem(stateStorageKey, state);
            window.location.href = buildAuthUrl({
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
            grantedPermissions,
            initialPermissions,
            storage,
            stateStorageKey,
            defaultModels,
            defaultBudget,
            defaultExpiry,
        ],
    );

    const logout = useCallback(() => {
        storage.removeItem(storageKey);
        setApiKey(null);
    }, [storage, storageKey]);

    const stateValue = useMemo<AuthStateValue>(
        () => ({ apiKey, isLoggedIn: !!apiKey }),
        [apiKey],
    );

    // Gate exposed data on apiKey so that on logout/401 consumers see null
    // data within the same render cycle that flips `isLoggedIn` to false,
    // not one render later when useResource catches up.
    const profileValue = useMemo<AuthProfileValue>(
        () => ({
            profile: apiKey ? profileResource.data : null,
            balance: apiKey ? balanceResource.data : null,
            isLoadingProfile: apiKey ? profileResource.isLoading : false,
        }),
        [
            apiKey,
            profileResource.data,
            profileResource.isLoading,
            balanceResource.data,
        ],
    );

    const keyValue = useMemo<AuthKeyValue>(
        () => ({
            key: apiKey ? keyResource.data : null,
            permissions: apiKey ? grantedPermissions : [],
            isLoadingKey: apiKey ? keyResource.isLoading : false,
        }),
        [apiKey, keyResource.data, keyResource.isLoading, grantedPermissions],
    );

    const actionsValue = useMemo<AuthActionsValue>(
        () => ({
            login,
            logout,
            refreshProfile,
            refreshBalance,
            refreshKey,
            refreshAuth,
            enterUrl,
        }),
        [
            login,
            logout,
            refreshProfile,
            refreshBalance,
            refreshKey,
            refreshAuth,
            enterUrl,
        ],
    );

    return (
        <AuthActionsContext.Provider value={actionsValue}>
            <AuthClientContext.Provider value={client}>
                <AuthStateContext.Provider value={stateValue}>
                    <AuthKeyContext.Provider value={keyValue}>
                        <AuthProfileContext.Provider value={profileValue}>
                            {children}
                        </AuthProfileContext.Provider>
                    </AuthKeyContext.Provider>
                </AuthStateContext.Provider>
            </AuthClientContext.Provider>
        </AuthActionsContext.Provider>
    );
}
