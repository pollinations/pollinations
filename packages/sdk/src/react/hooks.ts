import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { Pollinations } from "../client.js";
import type { UsageOptions, UsageResponse } from "../types.js";
import { PollinationsError } from "../types.js";
import {
    AuthActionsContext,
    type AuthActionsValue,
    AuthClientContext,
    type AuthContextValue,
    AuthKeyContext,
    type AuthKeyValue,
    AuthProfileContext,
    type AuthProfileValue,
    AuthStateContext,
    type AuthStateValue,
} from "./contexts.js";

export interface UseKeyUsageOptions extends Omit<UsageOptions, "format"> {
    enabled?: boolean;
}

export interface UseKeyUsageValue {
    usage: UsageResponse | null;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

/** Only `apiKey` + `isLoggedIn`; does not re-render on profile/balance changes. */
export function useAuthState(): AuthStateValue {
    const ctx = useContext(AuthStateContext);
    if (!ctx) {
        throw new Error("useAuthState must be used within a <PolliProvider>");
    }
    return ctx;
}

/** Only `profile` + `balance`; does not re-render on `apiKey` changes. */
export function useAuthProfile(): AuthProfileValue {
    const ctx = useContext(AuthProfileContext);
    if (!ctx) {
        throw new Error("useAuthProfile must be used within a <PolliProvider>");
    }
    return ctx;
}

/** Current delegated key info from `/account/key`. */
export function useAuthKey(): AuthKeyValue {
    const ctx = useContext(AuthKeyContext);
    if (!ctx) {
        throw new Error("useAuthKey must be used within a <PolliProvider>");
    }
    return ctx;
}

/** Stable login/logout refs, refresh actions, and provider config. */
export function useAuthActions(): AuthActionsValue {
    const ctx = useContext(AuthActionsContext);
    if (!ctx) {
        throw new Error("useAuthActions must be used within a <PolliProvider>");
    }
    return ctx;
}

/**
 * Memoized SDK client. `null` when logged out. Use for SDK methods not yet
 * covered by a dedicated hook; for usage/profile/balance/key, prefer the
 * narrower hooks above so React can skip unrelated re-renders.
 */
export function useAuthClient(): Pollinations | null {
    return useContext(AuthClientContext);
}

/**
 * Combined hook. Subscribes to ALL four auth contexts, so the calling
 * component re-renders on any change. Prefer the narrow hooks for
 * performance — `useAuth` is only here for ergonomics.
 */
export function useAuth(): AuthContextValue {
    return {
        ...useAuthState(),
        ...useAuthProfile(),
        ...useAuthKey(),
        ...useAuthActions(),
    };
}

/**
 * Internal: race-safe data fetcher tied to the provider's `client`.
 * Returns null data + loading=false when client is null (logged out).
 * Treats HTTP 401 by calling `onUnauthorized` (the provider then clears
 * the session). Other errors surface via `error`.
 */
function useResource<T>(
    client: Pollinations | null,
    fetcher: (client: Pollinations) => Promise<T>,
    onUnauthorized: () => void,
): {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
} {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        if (!client) {
            setData(null);
            setIsLoading(false);
            setError(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await fetcher(client);
            if (reqId !== reqIdRef.current) return;
            setData(result);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            if (err instanceof PollinationsError && err.status === 401) {
                onUnauthorized();
                return;
            }
            setData(null);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [client, fetcher, onUnauthorized]);

    return { data, isLoading, error, refresh };
}

/**
 * Internal-but-exported: used by PolliProvider for its three resources, and
 * by `useKeyUsage` below. Exported so the same race-safe shape is reusable
 * across the package.
 */
export { useResource };

/** Usage for the current delegated key only. Auto-refreshes when options change. */
export function useKeyUsage(
    options: UseKeyUsageOptions = {},
): UseKeyUsageValue {
    const client = useAuthClient();
    const { logout } = useAuthActions();
    const {
        enabled = true,
        days,
        limit,
        before,
        granularity,
        period,
    } = options;

    const fetcher = useCallback(
        (c: Pollinations) =>
            c.accountKeyUsage({ days, limit, before, granularity, period }),
        [days, limit, before, granularity, period],
    );

    // Treat a 401 on usage as session invalidation: the delegated key was
    // revoked or expired, so clear the session — same effect as the provider's
    // own resources' 401 handling.
    const { data, isLoading, error, refresh } = useResource(
        enabled ? client : null,
        fetcher,
        logout,
    );

    useEffect(() => {
        if (enabled) void refresh();
    }, [enabled, refresh]);

    return useMemo(
        () => ({ usage: data, isLoading, error, refresh }),
        [data, isLoading, error, refresh],
    );
}
