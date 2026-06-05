import { useCallback, useEffect, useState } from "react";

/**
 * Query-string-as-state. Backs a piece of state with a URL search param so it
 * survives reload and is shareable, while staying a normal React state value.
 * The URL is the source of truth — including the "not set" state, which is
 * represented by `null` (the param is absent from the URL).
 *
 * - Reads the initial value from the current URL (absent / invalid → `null`).
 * - Writes changes back with `history.replaceState` (no navigation / history
 *   spam); setting `null` removes the param.
 * - Stays in sync with back/forward navigation via `popstate`.
 *
 * `allowed` narrows the parsed value to a known set; anything else → `null`.
 */
export function useQueryParam<T extends string>(
    key: string,
    allowed?: readonly T[],
): [T | null, (next: T | null) => void] {
    const parse = useCallback(
        (raw: string | null): T | null => {
            if (raw === null) return null;
            if (allowed && !allowed.includes(raw as T)) return null;
            return raw as T;
        },
        [allowed],
    );

    const read = useCallback((): T | null => {
        if (typeof window === "undefined") return null;
        const params = new URLSearchParams(window.location.search);
        return parse(params.get(key));
    }, [key, parse]);

    const [value, setValue] = useState<T | null>(read);

    useEffect(() => {
        const onPopState = () => setValue(read());
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [read]);

    const set = useCallback(
        (next: T | null) => {
            setValue(next);
            if (typeof window === "undefined") return;
            const url = new URL(window.location.href);
            if (next === null) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, next);
            }
            window.history.replaceState(window.history.state, "", url);
        },
        [key],
    );

    return [value, set];
}
