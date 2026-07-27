import { useEffect, useState } from "react";

type Async<T> = { data: T; loading: boolean; failed: boolean };

/**
 * Fetch once on mount. Nothing on this site takes a parameter that changes,
 * so nothing needs to re-run — and a failed public feed degrades to `failed`
 * rather than throwing, because none of it is load-bearing.
 */
export function useAsync<T>(load: () => Promise<T>, initial: T): Async<T> {
    const [state, setState] = useState<Async<T>>({
        data: initial,
        loading: true,
        failed: false,
    });

    // biome-ignore lint/correctness/useExhaustiveDependencies: fetch once on mount
    useEffect(() => {
        let cancelled = false;
        load()
            .then((data) => {
                if (!cancelled)
                    setState({ data, loading: false, failed: false });
            })
            .catch(() => {
                if (!cancelled)
                    setState({ data: initial, loading: false, failed: true });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return state;
}
