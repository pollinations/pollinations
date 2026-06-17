import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { pollinationsErrorFromResponse } from "../error-response.js";
import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCatalogItem,
} from "../models.js";
import type {
    AccountBalance,
    AccountProfile,
    KeyInfo,
    KeyUsageOptions,
    ModelCategory,
    UsageResponse,
} from "../types.js";
import { PollinationsError } from "../types.js";
import {
    type AuthActionsValue,
    AuthContext,
    type AuthContextValue,
    type AuthStateValue,
} from "./contexts.js";

export interface AccountResourceValue<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

export interface UseAccountKeyUsageOptions extends KeyUsageOptions {
    enabled?: boolean;
}

export type UseAccountProfileValue = AccountResourceValue<AccountProfile>;
export type UseAccountBalanceValue = AccountResourceValue<AccountBalance>;
export type UseAccountKeyValue = AccountResourceValue<KeyInfo>;
export type UseAccountKeyUsageValue = AccountResourceValue<UsageResponse>;

type AccountFetcher<T> = (apiBaseUrl: string, apiKey: string) => Promise<T>;

function useRequiredAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error(
            "Pollinations auth hooks must be used within a <PolliProvider>",
        );
    }
    return ctx;
}

/** Current auth session state only. Does not fetch account data. */
export function useAuthState(): AuthStateValue {
    const { apiKey, isLoggedIn, isHydrated, error } = useRequiredAuth();
    return useMemo(
        () => ({ apiKey, isLoggedIn, isHydrated, error }),
        [apiKey, isLoggedIn, isHydrated, error],
    );
}

/** Stable login/logout refs and provider config. */
export function useAuthActions(): AuthActionsValue {
    const { login, logout, setApiKey, enterUrl, apiBaseUrl } =
        useRequiredAuth();
    return useMemo(
        () => ({ login, logout, setApiKey, enterUrl, apiBaseUrl }),
        [login, logout, setApiKey, enterUrl, apiBaseUrl],
    );
}

/** Combined thin auth hook. Account data is available through opt-in hooks. */
export function useAuth(): AuthContextValue {
    return useRequiredAuth();
}

function accountUrl(
    apiBaseUrl: string,
    path: string,
    params?: URLSearchParams,
): string {
    const qs = params?.toString();
    return `${apiBaseUrl.replace(/\/+$/, "")}${path}${qs ? `?${qs}` : ""}`;
}

async function fetchAccountJson<T>(
    apiBaseUrl: string,
    apiKey: string,
    path: string,
    params?: URLSearchParams,
): Promise<T> {
    const response = await fetch(accountUrl(apiBaseUrl, path, params), {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        throw await pollinationsErrorFromResponse(response);
    }

    return response.json() as Promise<T>;
}

function useAccountResource<T>(
    fetcher: AccountFetcher<T>,
    enabled = true,
): AccountResourceValue<T> {
    const { apiKey, apiBaseUrl, logout } = useRequiredAuth();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        if (!enabled || !apiKey) {
            setData(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await fetcher(apiBaseUrl, apiKey);
            if (reqId !== reqIdRef.current) return;
            setData(result);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            if (err instanceof PollinationsError && err.status === 401) {
                logout();
                return;
            }
            setData(null);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [apiKey, apiBaseUrl, enabled, fetcher, logout]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return useMemo(
        () => ({ data, isLoading, error, refresh }),
        [data, isLoading, error, refresh],
    );
}

/** Current account profile for the delegated key. */
export function useAccountProfile(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<AccountProfile>(
                apiBaseUrl,
                apiKey,
                "/account/profile",
            ),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

export interface UseModelCatalogValue {
    models: ModelCatalogItem[];
    allowedModelIds: ReadonlySet<string>;
    /** Categories the key may use: restricted to allowed models when logged in,
     * every public category when logged out. */
    allowedCategories: ModelCategory[];
    isLoggedIn: boolean;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

const EMPTY_MODELS: ModelCatalogItem[] = [];
const EMPTY_ALLOWED: ReadonlySet<string> = new Set();

/**
 * Loads the public model catalog and, when the provider holds an API key, the
 * set of models that key may use (`allowedModelIds`). The catalog is a public
 * endpoint, so `apiKey` is optional — this works logged out.
 */
export function useModelCatalog(
    options: { baseUrl?: string; enabled?: boolean } = {},
): UseModelCatalogValue {
    const { baseUrl, enabled = true } = options;
    const { apiKey, isLoggedIn } = useRequiredAuth();
    const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        if (!enabled) {
            setCatalog(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await fetchModelCatalog({ apiKey, baseUrl });
            if (reqId !== reqIdRef.current) return;
            setCatalog(result);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [apiKey, baseUrl, enabled]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return useMemo(() => {
        const models = catalog?.models ?? EMPTY_MODELS;
        const allowedModelIds = catalog?.allowedModelIds ?? EMPTY_ALLOWED;
        const allowed = isLoggedIn
            ? models.filter((model) => allowedModelIds.has(model.id))
            : models;
        const allowedCategories = [
            ...new Set(allowed.map((model) => model.category)),
        ];
        return {
            models,
            allowedModelIds,
            allowedCategories,
            isLoggedIn,
            isLoading,
            error,
            refresh,
        };
    }, [catalog, isLoggedIn, isLoading, error, refresh]);
}

/** Current visible balance for the delegated key. */
export function useAccountBalance(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<AccountBalance>(
                apiBaseUrl,
                apiKey,
                "/account/balance",
            ),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

/** Current delegated key metadata. */
export function useAccountKey(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<KeyInfo>(apiBaseUrl, apiKey, "/account/key"),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

/** Usage for the current delegated key only. */
export function useAccountKeyUsage(
    options: UseAccountKeyUsageOptions = {},
): UseAccountKeyUsageValue {
    const {
        enabled = true,
        days,
        limit,
        before,
        granularity,
        period,
    } = options;

    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) => {
            const params = new URLSearchParams();
            if (days) params.set("days", String(days));
            if (limit) params.set("limit", String(limit));
            if (before) params.set("before", before);
            if (granularity) params.set("granularity", granularity);
            if (period) params.set("period", period);
            return fetchAccountJson<UsageResponse>(
                apiBaseUrl,
                apiKey,
                "/account/key/usage",
                params,
            );
        },
        [days, limit, before, granularity, period],
    );
    return useAccountResource(fetcher, enabled);
}
