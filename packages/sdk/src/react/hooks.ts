import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type {
    AccountBalance,
    AccountProfile,
    KeyInfo,
    KeyUsageOptions,
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

async function pollinationsErrorFromResponse(
    response: Response,
): Promise<PollinationsError> {
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    const record =
        payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
    const nested =
        record.error && typeof record.error === "object"
            ? (record.error as Record<string, unknown>)
            : record;

    const message =
        typeof nested.message === "string"
            ? nested.message
            : response.statusText || `Request failed with ${response.status}`;
    const code =
        typeof nested.code === "string"
            ? nested.code
            : response.status === 401
              ? "UNAUTHORIZED"
              : "HTTP_ERROR";
    const details =
        nested.details && typeof nested.details === "object"
            ? (nested.details as Record<string, unknown>)
            : undefined;
    const requestId =
        typeof nested.requestId === "string" ? nested.requestId : undefined;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;

    return new PollinationsError(
        message,
        code,
        response.status,
        details,
        requestId,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
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
