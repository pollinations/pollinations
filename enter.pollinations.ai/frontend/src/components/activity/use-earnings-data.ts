import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { getPeriodBucketKeys, periodBucketKeyToDate } from "./period-utils.ts";
import type { DataPoint, ModelBreakdown, UsagePeriodSelection } from "./types";

export type DeveloperEarningsRow = {
    date: string;
    app_key_id: string;
    app_name: string;
    request_count: number;
    base_price_pollen: number;
    earned_pollen: number;
    charged_pollen: number;
    earned_paid_pollen: number;
    earned_reward_pollen: number;
    markup_rate: number;
    unique_user_count: number;
};

export type EarningsFilterState = {
    period: UsagePeriodSelection;
    selectedAppKeyIds: string[];
};

type TopApp = {
    id: string;
    label: string;
    requests: number;
    pollen: number;
    paidPollen: number;
    rewardPollen: number;
    uniqueUsers: number;
};

type EarningsDataResult = {
    loading: boolean;
    error: string | null;
    fetchEarnings: () => void;
    chartData: DataPoint[];
    stats: {
        totalPollen: number;
        totalPaid: number;
        totalReward: number;
        activeUsers: number;
        appCount: number;
        topApp: TopApp | null;
    };
};

export function useEarningsData(
    filters: EarningsFilterState,
): EarningsDataResult {
    const [dailyEarnings, setDailyEarnings] = useState<DeveloperEarningsRow[]>(
        [],
    );
    const [perApp, setPerApp] = useState<DeveloperEarningsRow[]>([]);
    const [globalSummary, setGlobalSummary] =
        useState<DeveloperEarningsRow | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);

    const selectedAppKeyIdsKey = filters.selectedAppKeyIds.join(",");
    const { granularity, period } = filters.period;

    const fetchEarnings = useCallback(() => {
        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;

        setLoading(true);
        setError(null);
        setDailyEarnings([]);
        setPerApp([]);
        setGlobalSummary(null);

        const query: {
            granularity: string;
            period: string;
            api_key_ids?: string;
        } = {
            granularity,
            period,
        };
        if (selectedAppKeyIdsKey) {
            query.api_key_ids = selectedAppKeyIdsKey;
        }

        apiClient.account.earnings
            .$get({ query }, { init: { signal: controller.signal } })
            .then((r) => {
                if (!r.ok)
                    throw new Error(
                        `Failed to fetch earnings data: ${r.status}`,
                    );
                return r.json() as Promise<{
                    daily: DeveloperEarningsRow[];
                    perApp: DeveloperEarningsRow[];
                    global: DeveloperEarningsRow | null;
                }>;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                setDailyEarnings(data.daily);
                setPerApp(data.perApp);
                setGlobalSummary(data.global);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error("Earnings fetch error:", err);
                setError(err.message || "Failed to load earnings data");
                setDailyEarnings([]);
                setPerApp([]);
                setGlobalSummary(null);
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setLoading(false);
            });
    }, [granularity, period, selectedAppKeyIdsKey]);

    useEffect(() => {
        fetchEarnings();
        return () => {
            inFlightRef.current?.abort();
        };
    }, [fetchEarnings]);

    const chartData = useMemo<DataPoint[]>(() => {
        type DayBucket = {
            requests: number;
            pollen: number;
            paid: number;
            reward: number;
            byApp: Map<
                string,
                { label: string; requests: number; pollen: number }
            >;
        };
        const buckets = new Map<string, DayBucket>();

        for (const r of dailyEarnings) {
            const dateKey = r.date;
            const cur = buckets.get(dateKey) || {
                requests: 0,
                pollen: 0,
                paid: 0,
                reward: 0,
                byApp: new Map(),
            };
            cur.requests += r.request_count;
            cur.pollen += r.earned_pollen;
            cur.paid += r.earned_paid_pollen;
            cur.reward += r.earned_reward_pollen;

            const appData = cur.byApp.get(r.app_key_id) || {
                label: r.app_name,
                requests: 0,
                pollen: 0,
            };
            appData.requests += r.request_count;
            appData.pollen += r.earned_pollen;
            cur.byApp.set(r.app_key_id, appData);
            buckets.set(dateKey, cur);
        }

        const isHourly = filters.period.granularity === "day";
        const bucketKeys = getPeriodBucketKeys(filters.period);

        return bucketKeys.map((bucketKey) => {
            const date = periodBucketKeyToDate(
                bucketKey,
                filters.period.granularity,
            );
            const d = buckets.get(bucketKey) || {
                requests: 0,
                pollen: 0,
                paid: 0,
                reward: 0,
                byApp: new Map<
                    string,
                    { label: string; requests: number; pollen: number }
                >(),
            };
            const appBreakdown: ModelBreakdown[] = Array.from(d.byApp.entries())
                .map(([appKeyId, appStats]) => ({
                    model: appKeyId,
                    label: appStats.label,
                    requests: appStats.requests,
                    pollen: appStats.pollen,
                }))
                .sort((a, b) => b.pollen - a.pollen);

            return {
                label: isHourly
                    ? date.toLocaleTimeString("en-US", {
                          timeZone: "UTC",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                      })
                    : date.toLocaleDateString("en-US", {
                          timeZone: "UTC",
                          month: "short",
                          day: "numeric",
                      }),
                fullDate: date.toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    ...(isHourly && {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }),
                }),
                value: d.pollen,
                rewardValue: d.reward,
                paidValue: d.paid,
                timestamp: date,
                modelBreakdown: appBreakdown,
            };
        });
    }, [dailyEarnings, filters.period]);

    const stats = useMemo(() => {
        const totalPollen = globalSummary?.earned_pollen ?? 0;
        const totalPaid = globalSummary?.earned_paid_pollen ?? 0;
        const totalReward = globalSummary?.earned_reward_pollen ?? 0;
        const activeUsers = globalSummary?.unique_user_count ?? 0;
        const appCount = perApp.length;

        const topAppRow = [...perApp].sort(
            (a, b) => b.earned_pollen - a.earned_pollen,
        )[0];
        const topApp: TopApp | null = topAppRow
            ? {
                  id: topAppRow.app_key_id,
                  label: topAppRow.app_name,
                  requests: topAppRow.request_count,
                  pollen: topAppRow.earned_pollen,
                  paidPollen: topAppRow.earned_paid_pollen,
                  rewardPollen: topAppRow.earned_reward_pollen,
                  uniqueUsers: topAppRow.unique_user_count,
              }
            : null;

        return {
            totalPollen,
            totalPaid,
            totalReward,
            activeUsers,
            appCount,
            topApp,
        };
    }, [perApp, globalSummary]);

    return {
        loading,
        error,
        fetchEarnings,
        chartData,
        stats,
    };
}
