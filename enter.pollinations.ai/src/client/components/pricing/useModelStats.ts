/**
 * Hook to fetch real model usage statistics
 * Uses the backend /api/model-stats endpoint which caches Tinybird data server-side
 */

import { useState, useEffect } from "react";

export type ModelStats = {
    model: string;
    request_count: number;
    avg_cost_usd: number;
    avg_response_ms: number;
    success_count: number;
    error_count: number;
};

type UseModelStatsResult = {
    stats: Map<string, ModelStats>;
    isLoading: boolean;
    error: Error | null;
};

/**
 * Fetches real model usage statistics from the backend
 * Returns a Map keyed by model name for O(1) lookups
 */
export function useModelStats(): UseModelStatsResult {
    const [stats, setStats] = useState<Map<string, ModelStats>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchStats() {
            try {
                const response = await fetch("/api/model-stats");
                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.status}`);
                }

                const json = (await response.json()) as { data?: ModelStats[] };

                if (!cancelled && json.data) {
                    const statsMap = new Map<string, ModelStats>();
                    for (const stat of json.data) {
                        statsMap.set(stat.model, stat);
                    }
                    setStats(statsMap);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err : new Error(String(err)),
                    );
                }
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

    return { stats, isLoading, error };
}
