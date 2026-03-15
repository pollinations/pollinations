import { useEffect, useRef, useState } from "react";

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

function readCache<T>(key: string): CacheEntry<T> | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as CacheEntry<T>;
    } catch {
        return null;
    }
}

function writeCache<T>(key: string, data: T): void {
    try {
        const entry: CacheEntry<T> = { data, timestamp: Date.now() };
        localStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // localStorage full or unavailable — silently ignore
    }
}

/**
 * Stale-while-revalidate hook backed by localStorage.
 *
 * On mount:
 * - If cached data exists and is within `ttlMs`, returns it immediately without fetching.
 * - If cached data exists but is stale, returns it immediately AND fetches in background.
 * - If no cache, fetches immediately.
 *
 * @param key       localStorage key
 * @param fetcher   async function that returns fresh data (return null to skip)
 * @param ttlMs     time-to-live in milliseconds
 * @param enabled   set to false to skip fetching (default true)
 */
export function useCachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number,
    enabled = true,
): { data: T | null; loading: boolean } {
    const cached = enabled ? readCache<T>(key) : null;

    const [data, setData] = useState<T | null>(cached?.data ?? null);
    const [loading, setLoading] = useState<boolean>(!!(enabled && !cached));

    // Track the key so we can skip stale responses
    const activeKey = useRef(key);
    activeKey.current = key;

    // Stable ref for fetcher to avoid re-triggering the effect
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        const entry = readCache<T>(key);
        const fresh = entry ? Date.now() - entry.timestamp < ttlMs : false;

        // Serve cache immediately
        if (entry) {
            setData(entry.data);
        }

        // If fresh, no need to refetch
        if (fresh) {
            setLoading(false);
            return;
        }

        // If no cache at all, mark as loading
        if (!entry) {
            setLoading(true);
        }

        let cancelled = false;

        fetcherRef.current().then(
            (freshData) => {
                if (cancelled || activeKey.current !== key) return;
                writeCache(key, freshData);
                setData(freshData);
                setLoading(false);
            },
            (err) => {
                if (cancelled) return;
                console.error(`useCachedFetch(${key}): fetch failed`, err);
                // If we have stale data, keep showing it
                if (!entry) setLoading(false);
            },
        );

        return () => {
            cancelled = true;
        };
    }, [key, ttlMs, enabled]);

    return { data, loading };
}
