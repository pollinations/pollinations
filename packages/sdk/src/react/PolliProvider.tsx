import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { pollinationsErrorFromResponse } from "../error-response.js";
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
import {
    canonicalizeTopUpReturnUrl,
    consumeTopUpReturn,
    type TopUpRequest,
} from "./top-up.js";

export type { AuthorizeRequest } from "./contexts.js";
export type { StorageAdapter, StorageOption } from "./storage.js";

export const DEFAULT_ENTER_URL = "https://enter.pollinations.ai";
const TOP_UP_STATUS_LIFETIME_MS = 15_000;
const BYOP_DOCS_URL =
    "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md";

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

function currentRedirectUrl(): string | null {
    if (typeof window === "undefined") return null;
    return window.location.href.split("#")[0] ?? window.location.href;
}

function isProductionRuntime(): boolean {
    return globalThis.process?.env?.NODE_ENV === "production";
}

function isLoopbackHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:") return false;
        const hostname = url.hostname
            .toLowerCase()
            .replace(/^\[(.*)\]$/, "$1")
            .replace(/\.$/, "");
        return (
            hostname === "localhost" ||
            hostname === "0.0.0.0" ||
            hostname === "::1" ||
            /^127\.\d+\.\d+\.\d+$/.test(hostname)
        );
    } catch {
        return false;
    }
}

function describeAppKey(appKey: string): string {
    if (!appKey) return "<empty>";
    if (appKey.length <= 8) return `${appKey.slice(0, 3)}...`;
    return `${appKey.slice(0, 3)}...${appKey.slice(-4)}`;
}

function warnAuthSetup(appKey: string, redirectUrl: string | null): void {
    if (isProductionRuntime()) return;

    if (!appKey || !appKey.startsWith("pk_")) {
        console.warn(
            `[PolliProvider] appKey should be a publishable pk_ App Key. Received ${describeAppKey(
                appKey,
            )}. Create one in Enter and pass it to <PolliProvider appKey="pk_..." />. ${BYOP_DOCS_URL}`,
        );
    }

    if (redirectUrl && isLoopbackHttpUrl(redirectUrl)) {
        console.info(
            `[PolliProvider] Local auth redirect URI: ${redirectUrl}\nAdd this URI to your App Key redirectUris in Enter. ${BYOP_DOCS_URL}`,
        );
    }
}

/**
 * Provides Pollinations auth state to descendants. Wrap your app once at the
 * root. Holds the delegated API key, handles OAuth and validated top-up
 * returns, and exposes login/logout/top-up actions. Account data and the
 * bounded post-checkout refresh are owned by opt-in hooks.
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
    const topUpStateStorageKey = `polli:${appKey}:topup_state`;

    const defaultPermissions = useMemo<readonly AccountPermission[]>(
        () => permissions ?? [],
        [permissions],
    );

    // SSR-safe: start null so server + client first paint agree.
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [topUpStatus, setTopUpStatus] = useState<
        "success" | "canceled" | null
    >(null);
    const topUpInFlightRef = useRef(false);

    useEffect(() => {
        warnAuthSetup(appKey, currentRedirectUrl());
    }, [appKey]);

    useEffect(() => {
        if (topUpStatus === null) return;
        const timeout = setTimeout(
            () => setTopUpStatus(null),
            TOP_UP_STATUS_LIFETIME_MS,
        );
        return () => clearTimeout(timeout);
    }, [topUpStatus]);

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

        const topUpResult = consumeTopUpReturn(
            window.location,
            window.sessionStorage,
            topUpStateStorageKey,
        );
        if (topUpResult.invalidState) {
            console.warn(
                "[PolliProvider] dropping top-up response with missing or mismatched state",
            );
        }
        // A StrictMode effect replay sees the already-cleaned URL. Preserve the
        // status captured by the first pass instead of overwriting it with null.
        if (topUpResult.status !== null) {
            setTopUpStatus(topUpResult.status);
        }

        const authLocation = topUpResult.cleanedUrl
            ? new URL(topUpResult.cleanedUrl, window.location.href)
            : window.location;
        const result = consumeOAuthCallback(
            authLocation,
            storage,
            stateStorageKey,
        );
        const cleanedUrl = result.cleanedUrl ?? topUpResult.cleanedUrl;
        if (cleanedUrl) {
            window.history.replaceState({}, "", cleanedUrl);
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
    }, [
        stateStorageKey,
        storage,
        updateApiKey,
        storageKey,
        topUpStateStorageKey,
    ]);

    const login = useCallback(
        (request?: AuthorizeRequest) => {
            if (typeof window === "undefined") return;
            const currentUrl = currentRedirectUrl();
            if (!currentUrl) return;
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

    const topUp = useCallback(
        async (request: TopUpRequest = {}) => {
            if (typeof window === "undefined") return;
            if (!apiKey)
                throw new Error("Connect your account before adding Pollen");
            if (topUpInFlightRef.current) {
                throw new Error("Checkout is already opening");
            }

            topUpInFlightRef.current = true;
            let topupState: string | null = null;

            try {
                const returnUri = canonicalizeTopUpReturnUrl(
                    request.returnUrl ?? window.location.href,
                );
                topupState = crypto.randomUUID();
                window.sessionStorage.setItem(topUpStateStorageKey, topupState);
                const response = await fetch(
                    `${resolvedApiBaseUrl.replace(/\/+$/, "")}/stripe/top-up-intents`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            packKey: request.packKey ?? "p5",
                            returnUri,
                            topupState,
                        }),
                    },
                );
                if (!response.ok) {
                    throw await pollinationsErrorFromResponse(response);
                }
                const result = (await response.json()) as { url: string };
                window.location.assign(result.url);
                // location.assign schedules navigation but may leave this page
                // alive in bfcache. Release the guard before the page freezes so
                // Back restores a usable provider.
                topUpInFlightRef.current = false;
            } catch (err) {
                if (
                    topupState !== null &&
                    window.sessionStorage.getItem(topUpStateStorageKey) ===
                        topupState
                ) {
                    window.sessionStorage.removeItem(topUpStateStorageKey);
                }
                topUpInFlightRef.current = false;
                throw err;
            }
        },
        [apiKey, resolvedApiBaseUrl, topUpStateStorageKey],
    );

    const authValue = useMemo<AuthContextValue>(
        () => ({
            apiKey,
            isLoggedIn: !!apiKey,
            isHydrated,
            error,
            topUpStatus,
            login,
            logout,
            setApiKey: updateApiKey,
            topUp,
            enterUrl,
            apiBaseUrl: resolvedApiBaseUrl,
        }),
        [
            apiKey,
            isHydrated,
            error,
            topUpStatus,
            login,
            logout,
            updateApiKey,
            topUp,
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
