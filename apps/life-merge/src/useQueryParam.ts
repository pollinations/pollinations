import { useCallback, useEffect, useState } from "react";

/**
 * Query-string-as-state. Backs a piece of state with a URL search param so it
 * survives reload and is shareable, while staying a normal React state value.
 *
 * - Reads the initial value from the current URL (falling back to `fallback`).
 * - Writes changes back with `history.replaceState` (no navigation / history spam).
 * - Stays in sync with back/forward navigation via `popstate`.
 *
 * `allowed` narrows the parsed value to a known set; anything else falls back.
 */
export function useQueryParam<T extends string>(
    key: string,
    fallback: T,
    allowed?: readonly T[],
): [T, (next: T) => void] {
    const parse = useCallback(
        (raw: string | null): T => {
            if (raw === null) return fallback;
            if (allowed && !allowed.includes(raw as T)) return fallback;
            return raw as T;
        },
        [allowed, fallback],
    );

    const read = useCallback((): T => {
        if (typeof window === "undefined") return fallback;
        const params = new URLSearchParams(window.location.search);
        return parse(params.get(key));
    }, [key, parse, fallback]);

    const [value, setValue] = useState<T>(read);

    useEffect(() => {
        const onPopState = () => setValue(read());
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [read]);

    const set = useCallback(
        (next: T) => {
            setValue(next);
            if (typeof window === "undefined") return;
            const url = new URL(window.location.href);
            if (next === fallback) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, next);
            }
            window.history.replaceState(window.history.state, "", url);
        },
        [key, fallback],
    );

    return [value, set];
}
