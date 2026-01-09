/**
 * Hook to fetch real-time model statistics from Tinybird
 */

import { useState, useEffect } from "react";

const TINYBIRD_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";

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
                const response = await fetch(TINYBIRD_MODEL_STATS_URL);
                if (!response.ok) {
                    throw new Error(`Tinybird API error: ${response.status}`);
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

    return { stats, isLoading, error };
}
