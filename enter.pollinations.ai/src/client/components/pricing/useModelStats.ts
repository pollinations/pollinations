/**
 * Hook to fetch real-time model statistics
 * Uses the backend /api/model-stats endpoint which caches Tinybird data server-side (6h TTL)
 */

import { useState, useEffect, useMemo } from "react";

export type ModelStats = Record<
    string,
    { avgCost: number; requestCount: number }
>;

type TinybirdResponse = {
    data?: Array<{
        model: string;
        avg_cost_usd: number;
        request_count: number;
    }>;
};

export function useModelStats(): {
    stats: ModelStats;
    isLoading: boolean;
    error: Error | null;
} {
    const [stats, setStats] = useState<ModelStats>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchStats() {
            try {
                const response = await fetch("/api/model-stats");
                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data: TinybirdResponse = await response.json();

                if (cancelled) return;

                const statsMap: ModelStats = {};
                for (const row of data.data || []) {
                    statsMap[row.model] = {
                        avgCost: row.avg_cost_usd,
                        requestCount: row.request_count,
                    };
                }

                setStats(statsMap);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                setError(
                    err instanceof Error ? err : new Error("Unknown error"),
                );
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchStats();

        return () => {
            cancelled = true;
        };
    }, []);

    // Memoize to prevent unnecessary re-renders when stats haven't changed
    const memoizedStats = useMemo(() => stats, [stats]);

    return { stats: memoizedStats, isLoading, error };
}
