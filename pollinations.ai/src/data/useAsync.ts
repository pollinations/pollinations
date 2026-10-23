import { useEffect, useState } from "react";

type Async<T> = { data: T; loading: boolean; failed: boolean };

export type UseAsyncOptions = {
    refreshMs?: number;
    /** Re-run the loader when a caller-controlled range or filter changes. */
    key?: string | number;
};

/**
 * Fetch on mount and whenever an explicit key changes. A failed public feed
 * degrades to `failed` rather than throwing, because none of it is load-bearing.
 */
export function useAsync<T>(
    load: () => Promise<T>,
    initial: T,
    options: UseAsyncOptions = {},
): Async<T> {
    const { refreshMs, key } = options;
    const [state, setState] = useState<Async<T>>({
        data: initial,
        loading: true,
        failed: false,
    });

    // biome-ignore lint/correctness/useExhaustiveDependencies: callers pass inline loaders; only scheduling options should restart the feed
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const run = async () => {
            setState((current) => ({
                ...current,
                loading: true,
                failed: false,
            }));
            try {
                const data = await load();
                if (!cancelled) {
                    setState({ data, loading: false, failed: false });
                }
            } catch {
                if (!cancelled) {
                    setState({ data: initial, loading: false, failed: true });
                }
            } finally {
                if (!cancelled && refreshMs) {
                    timer = setTimeout(run, refreshMs);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [refreshMs, key]);

    return state;
}
