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
    const { apiKey, isLoggedIn, isHydrated, error, topUpStatus } =
        useRequiredAuth();
    return useMemo(
        () => ({ apiKey, isLoggedIn, isHydrated, error, topUpStatus }),
        [apiKey, isLoggedIn, isHydrated, error, topUpStatus],
    );
}

/** Stable login/logout/top-up actions and provider URLs. */
export function useAuthActions(): AuthActionsValue {
    const { login, logout, setApiKey, topUp, enterUrl, apiBaseUrl } =
        useRequiredAuth();
    return useMemo(
        () => ({ login, logout, setApiKey, topUp, enterUrl, apiBaseUrl }),
        [login, logout, setApiKey, topUp, enterUrl, apiBaseUrl],
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
    loadOnMount = true,
): readonly [AccountResourceValue<T>, () => Promise<T | null>] {
    const { apiKey, apiBaseUrl, logout } = useRequiredAuth();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refreshResult = useCallback(async (): Promise<T | null> => {
        const reqId = ++reqIdRef.current;
        if (!enabled || !apiKey) {
            setData(null);
            setIsLoading(false);
            setError(null);
            return null;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await fetcher(apiBaseUrl, apiKey);
            if (reqId !== reqIdRef.current) return null;
            setData(result);
            return result;
        } catch (err) {
            if (reqId !== reqIdRef.current) return null;
            if (err instanceof PollinationsError && err.status === 401) {
                logout();
                return null;
            }
            setData(null);
            setError(err instanceof Error ? err : new Error(String(err)));
            return null;
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [apiKey, apiBaseUrl, enabled, fetcher, logout]);

    const refresh = useCallback(async () => {
        await refreshResult();
    }, [refreshResult]);

    useEffect(() => {
        if (loadOnMount) void refreshResult();
    }, [loadOnMount, refreshResult]);

    return useMemo(
        () => [{ data, isLoading, error, refresh }, refreshResult] as const,
        [data, isLoading, error, refresh, refreshResult],
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
    return useAccountResource(fetcher, enabled)[0];
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

/**
 * Current balance visible to the delegated key, including whether it is an
 * app allowance or wallet balance. After a validated successful top-up
 * return, refreshes on a bounded 0/2/5/10-second schedule until the observable
 * account balance changes.
 */
export function useAccountBalance(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const { topUpStatus } = useRequiredAuth();
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<AccountBalance>(
                apiBaseUrl,
                apiKey,
                "/account/balance",
            ),
        [],
    );
    const [resource, refreshResult] = useAccountResource(
        fetcher,
        enabled,
        topUpStatus !== "success",
    );

    useEffect(() => {
        if (!enabled || topUpStatus !== "success") return;

        let canceled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const wait = (ms: number) =>
            new Promise<void>((resolve) => {
                timeout = setTimeout(resolve, ms);
            });

        void (async () => {
            const initial = await refreshResult();
            const baseline = initial?.accountBalance;
            if (canceled || baseline === undefined) return;

            let elapsed = 0;
            for (const target of [2_000, 5_000, 10_000]) {
                await wait(target - elapsed);
                elapsed = target;
                if (canceled) return;
                const next = await refreshResult();
                if (
                    next?.accountBalance !== undefined &&
                    next.accountBalance !== baseline
                ) {
                    return;
                }
            }
        })();

        return () => {
            canceled = true;
            if (timeout) clearTimeout(timeout);
        };
    }, [enabled, refreshResult, topUpStatus]);

    return resource;
}

/** Current delegated key metadata. */
export function useAccountKey(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<KeyInfo>(apiBaseUrl, apiKey, "/account/key"),
        [],
    );
    return useAccountResource(fetcher, enabled)[0];
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
    return useAccountResource(fetcher, enabled)[0];
}
