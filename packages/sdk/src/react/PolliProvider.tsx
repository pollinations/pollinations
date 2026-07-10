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
    codeChallenge: string;
}): string {
    const params = new URLSearchParams();
    params.set("redirect_uri", args.redirectUrl);
    params.set("client_id", args.appKey);
    params.set("state", args.state);
    params.set("response_type", "code");
    params.set("code_challenge", args.codeChallenge);
    params.set("code_challenge_method", "S256");
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

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function createPkce(): Promise<{
    verifier: string;
    challenge: string;
}> {
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return { verifier, challenge: base64Url(new Uint8Array(digest)) };
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
 * root. Holds the delegated API key, handles the OAuth callback, and exposes
 * connect, local logout, and revocation actions. Account data is fetched by
 * opt-in hooks so apps only request the data they render.
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
    const pendingStorageKey = `polli:${appKey}:oauth_pending`;

    const defaultPermissions = useMemo<readonly AccountPermission[]>(
        () => permissions ?? [],
        [permissions],
    );

    // SSR-safe: start null so server + client first paint agree.
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        warnAuthSetup(appKey, currentRedirectUrl());
    }, [appKey]);

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

    // Hydrate API key from storage or exchange an OAuth code after redirect.
    useEffect(() => {
        let cancelled = false;
        async function hydrate() {
            if (typeof window === "undefined") {
                setIsHydrated(true);
                return;
            }

            const result = consumeOAuthCallback(
                window.location,
                storage,
                pendingStorageKey,
            );
            if (result.cleanedUrl) {
                window.history.replaceState({}, "", result.cleanedUrl);
            }
            if (result.invalidState) {
                console.warn(
                    "[PolliProvider] dropping auth response with missing or mismatched state",
                );
                setError(new Error("Invalid OAuth state"));
            } else if (result.error) {
                console.warn(
                    `[PolliProvider] auth error: ${result.error}${
                        result.errorDescription
                            ? ` — ${result.errorDescription}`
                            : ""
                    }`,
                );
                setError(new Error(result.errorDescription ?? result.error));
            } else if (
                result.code &&
                result.codeVerifier &&
                result.redirectUri
            ) {
                try {
                    const response = await fetch(
                        `${enterUrl.replace(/\/+$/, "")}/api/oauth/token`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded",
                            },
                            body: new URLSearchParams({
                                grant_type: "authorization_code",
                                code: result.code,
                                client_id: appKey,
                                redirect_uri: result.redirectUri,
                                code_verifier: result.codeVerifier,
                            }),
                        },
                    );
                    storage.removeItem(pendingStorageKey);
                    const token = (await response.json().catch(() => ({}))) as {
                        access_token?: string;
                        error?: string;
                        error_description?: string;
                    };
                    if (!response.ok || !token.access_token) {
                        throw new Error(
                            token.error_description ||
                                token.error ||
                                "OAuth token exchange failed",
                        );
                    }
                    if (!cancelled) updateApiKey(token.access_token);
                } catch (err) {
                    if (!cancelled) {
                        setError(
                            err instanceof Error ? err : new Error(String(err)),
                        );
                    }
                }
            } else {
                const stored = storage.getItem(storageKey);
                if (stored) setApiKey(stored);
            }
            if (!cancelled) setIsHydrated(true);
        }

        void hydrate();
        return () => {
            cancelled = true;
        };
    }, [
        appKey,
        enterUrl,
        pendingStorageKey,
        storage,
        updateApiKey,
        storageKey,
    ]);

    const login = useCallback(
        async (request?: AuthorizeRequest) => {
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
            const pkce = await createPkce();
            storage.setItem(
                pendingStorageKey,
                JSON.stringify({
                    state,
                    codeVerifier: pkce.verifier,
                    redirectUri: currentUrl,
                }),
            );
            window.location.href = buildAuthorizeUrl({
                enterUrl,
                appKey,
                permissions: perms,
                redirectUrl: currentUrl,
                state,
                models: request?.models ?? defaultModels,
                budget: request?.budget ?? defaultBudget,
                expiry: request?.expiry ?? defaultExpiry,
                codeChallenge: pkce.challenge,
            });
        },
        [
            enterUrl,
            appKey,
            defaultPermissions,
            storage,
            pendingStorageKey,
            defaultModels,
            defaultBudget,
            defaultExpiry,
        ],
    );

    const logout = useCallback(() => {
        updateApiKey(null);
    }, [updateApiKey]);

    const disconnect = useCallback(async () => {
        if (!apiKey) return;
        const response = await fetch(
            `${enterUrl.replace(/\/+$/, "")}/api/oauth/revoke`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ token: apiKey }),
            },
        );
        if (!response.ok) {
            throw new Error("Failed to disconnect Pollinations account");
        }
        updateApiKey(null);
    }, [apiKey, enterUrl, updateApiKey]);

    const authValue = useMemo<AuthContextValue>(
        () => ({
            apiKey,
            isLoggedIn: !!apiKey,
            isHydrated,
            error,
            login,
            logout,
            disconnect,
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
            disconnect,
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
