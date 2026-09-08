import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
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
    codeChallenge: string;
    models?: readonly string[];
    budget?: number;
    expiry?: number;
}): string {
    const params = new URLSearchParams();
    params.set("redirect_uri", args.redirectUrl);
    params.set("client_id", args.appKey);
    params.set("response_type", "code");
    params.set("state", args.state);
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

function currentRedirectUrl(): string | null {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
}

function currentReturnPath(): string | null {
    if (typeof window === "undefined") return null;
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createPkceVerifier(): string {
    return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

async function createPkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function exchangeAuthorizationCode(args: {
    enterUrl: string;
    appKey: string;
    redirectUrl: string;
    code: string;
    verifier: string;
}): Promise<string> {
    const response = await fetch(`${args.enterUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: args.code,
            client_id: args.appKey,
            redirect_uri: args.redirectUrl,
            code_verifier: args.verifier,
        }),
    });
    const body = (await response.json().catch(() => null)) as {
        access_token?: string;
        error?: string;
        error_description?: string;
    } | null;
    if (!response.ok || !body?.access_token) {
        throw new Error(
            body?.error_description ?? body?.error ?? "Token exchange failed",
        );
    }
    return body.access_token;
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
    const verifierStorageKey = `polli:${appKey}:oauth_verifier`;
    const returnPathStorageKey = `polli:${appKey}:oauth_return_path`;
    // Authorization codes are single-use; React StrictMode must not exchange
    // the same callback twice when it replays effects in development.
    const hydrationStarted = useRef(false);
    const loginStarted = useRef(false);

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

    // Hydrate the stored key or exchange an OAuth callback code.
    useEffect(() => {
        if (typeof window === "undefined" || hydrationStarted.current) return;
        hydrationStarted.current = true;

        const result = consumeOAuthCallback(
            window.location,
            storage,
            stateStorageKey,
        );
        const returnPath = storage.getItem(returnPathStorageKey);
        const callbackUrl = result.cleanedUrl
            ? (returnPath ?? result.cleanedUrl)
            : null;
        if (callbackUrl) window.history.replaceState({}, "", callbackUrl);

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
            storage.removeItem(verifierStorageKey);
            storage.removeItem(returnPathStorageKey);
        }

        const storedKey = storage.getItem(storageKey);
        if (!result.code) {
            if (storedKey) setApiKey(storedKey);
            setIsHydrated(true);
            return;
        }

        const verifier = storage.getItem(verifierStorageKey);
        const redirectUrl = currentRedirectUrl();
        storage.removeItem(verifierStorageKey);
        storage.removeItem(returnPathStorageKey);
        if (!verifier || !redirectUrl) {
            setError(new Error("Missing PKCE verifier"));
            setIsHydrated(true);
            return;
        }

        void exchangeAuthorizationCode({
            enterUrl,
            appKey,
            redirectUrl,
            code: result.code,
            verifier,
        })
            .then(updateApiKey)
            .catch((cause) => {
                setError(
                    cause instanceof Error
                        ? cause
                        : new Error("Token exchange failed"),
                );
            })
            .finally(() => setIsHydrated(true));
    }, [
        appKey,
        enterUrl,
        returnPathStorageKey,
        stateStorageKey,
        storage,
        storageKey,
        updateApiKey,
        verifierStorageKey,
    ]);

    const login = useCallback(
        (request?: AuthorizeRequest) => {
            if (typeof window === "undefined" || loginStarted.current) return;
            const redirectUrl = currentRedirectUrl();
            const returnPath = currentReturnPath();
            if (!redirectUrl || !returnPath) return;
            loginStarted.current = true;
            const extraPermissions = request?.permissions;
            const perms: AccountPermission[] =
                extraPermissions && extraPermissions.length > 0
                    ? Array.from(
                          new Set([...defaultPermissions, ...extraPermissions]),
                      )
                    : [...defaultPermissions];
            const state = crypto.randomUUID();
            const verifier = createPkceVerifier();
            storage.setItem(stateStorageKey, state);
            storage.setItem(verifierStorageKey, verifier);
            storage.setItem(returnPathStorageKey, returnPath);
            void createPkceChallenge(verifier)
                .then((codeChallenge) => {
                    window.location.href = buildAuthorizeUrl({
                        enterUrl,
                        appKey,
                        permissions: perms,
                        redirectUrl,
                        state,
                        codeChallenge,
                        models: request?.models ?? defaultModels,
                        budget: request?.budget ?? defaultBudget,
                        expiry: request?.expiry ?? defaultExpiry,
                    });
                })
                .catch((cause) => {
                    loginStarted.current = false;
                    storage.removeItem(stateStorageKey);
                    storage.removeItem(verifierStorageKey);
                    storage.removeItem(returnPathStorageKey);
                    setError(
                        cause instanceof Error
                            ? cause
                            : new Error("Could not start authorization"),
                    );
                });
        },
        [
            enterUrl,
            appKey,
            defaultPermissions,
            storage,
            stateStorageKey,
            verifierStorageKey,
            returnPathStorageKey,
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
