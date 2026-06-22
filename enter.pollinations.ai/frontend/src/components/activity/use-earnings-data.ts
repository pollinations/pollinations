import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import type {
    DataPoint,
    Metric,
    ModelBreakdown,
    UsagePeriodSelection,
} from "./types";

export type DeveloperEarningsRow = {
    date: string;
    app_key_id: string;
    app_name: string;
    requests: number;
    baseline_price: number;
    /** Requests paid from paid balance. Optional — pipe may not yet split. */
    paid_requests?: number;
    /** Requests paid from tier balance. Optional — pipe may not yet split. */
    tier_requests?: number;
    pollen_earned: number;
    /** Earnings from paid-balance spend. Optional — pipe may not yet split. */
    paid_earned?: number;
    /** Earnings from tier-balance spend. Optional — pipe may not yet split. */
    tier_earned?: number;
    markup_rate: number;
    unique_users: number;
};

export type EarningsFilterState = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedAppKeyIds: string[];
};

type TopApp = {
    id: string;
    label: string;
    requests: number;
    pollen: number;
    paidPollen: number;
    tierPollen: number;
    uniqueUsers: number;
};

type EarningsDataResult = {
    loading: boolean;
    error: string | null;
    fetchEarnings: () => void;
    usedApps: { id: string; label: string }[];
    chartData: DataPoint[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        totalPaid: number;
        totalTier: number;
        averageMarkupRate: number;
        activeUsers: number | null;
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
        } = {
            granularity,
            period,
        };

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
    }, [granularity, period]);

    useEffect(() => {
        fetchEarnings();
        return () => {
            inFlightRef.current?.abort();
        };
    }, [fetchEarnings]);

    const usedApps = useMemo(() => {
        const appLabels = new Map<string, string>();
        for (const r of perApp) {
            if (!r.app_key_id) continue;
            if (appLabels.has(r.app_key_id)) continue;
            appLabels.set(r.app_key_id, r.app_name || r.app_key_id);
        }

        return Array.from(appLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [perApp]);

    const selectedAppKeyIds = filters.selectedAppKeyIds;
    const filteredDailyEarnings = useMemo(() => {
        if (selectedAppKeyIds.length === 0) return dailyEarnings;
        return dailyEarnings.filter((row) =>
            selectedAppKeyIds.includes(row.app_key_id),
        );
    }, [dailyEarnings, selectedAppKeyIds]);

    const filteredPerApp = useMemo(() => {
        if (selectedAppKeyIds.length === 0) return perApp;
        return perApp.filter((row) =>
            selectedAppKeyIds.includes(row.app_key_id),
        );
    }, [perApp, selectedAppKeyIds]);

    const chartData = useMemo<DataPoint[]>(() => {
        type DayBucket = {
            requests: number;
            pollen: number;
            paidRequests: number;
            tierRequests: number;
            paidPollen: number;
            tierPollen: number;
            byApp: Map<
                string,
                { label: string; requests: number; pollen: number }
            >;
        };
        const buckets = new Map<string, DayBucket>();

        for (const r of filteredDailyEarnings) {
            const dateKey = r.date;
            const cur = buckets.get(dateKey) || {
                requests: 0,
                pollen: 0,
                paidRequests: 0,
                tierRequests: 0,
                paidPollen: 0,
                tierPollen: 0,
                byApp: new Map(),
            };
            cur.requests += r.requests;
            cur.pollen += r.pollen_earned;
            // If pipe doesn't yet split, fall back to all-paid.
            cur.paidRequests += r.paid_requests ?? r.requests;
            cur.tierRequests += r.tier_requests ?? 0;
            cur.paidPollen += r.paid_earned ?? r.pollen_earned;
            cur.tierPollen += r.tier_earned ?? 0;

            const appData = cur.byApp.get(r.app_key_id) || {
                label: r.app_name,
                requests: 0,
                pollen: 0,
            };
            appData.requests += r.requests;
            appData.pollen += r.pollen_earned;
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
                paidRequests: 0,
                tierRequests: 0,
                paidPollen: 0,
                tierPollen: 0,
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
                .sort((a, b) => {
                    const left =
                        filters.metric === "requests" ? a.requests : a.pollen;
                    const right =
                        filters.metric === "requests" ? b.requests : b.pollen;
                    return right - left;
                });

            const isRequestsMetric = filters.metric === "requests";

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
                value: isRequestsMetric ? d.requests : d.pollen,
                tierValue: isRequestsMetric ? d.tierRequests : d.tierPollen,
                paidValue: isRequestsMetric ? d.paidRequests : d.paidPollen,
                timestamp: date,
                modelBreakdown: appBreakdown,
            };
        });
    }, [filteredDailyEarnings, filters.metric, filters.period]);

    const stats = useMemo(() => {
        const hasAppFilter = selectedAppKeyIds.length > 0;
        const totalRequests = hasAppFilter
            ? filteredPerApp.reduce((sum, row) => sum + row.requests, 0)
            : (globalSummary?.requests ?? 0);
        const totalPollen = hasAppFilter
            ? filteredPerApp.reduce((sum, row) => sum + row.pollen_earned, 0)
            : (globalSummary?.pollen_earned ?? 0);
        const totalPaid = hasAppFilter
            ? filteredPerApp.reduce(
                  (sum, row) => sum + (row.paid_earned ?? row.pollen_earned),
                  0,
              )
            : (globalSummary?.paid_earned ?? globalSummary?.pollen_earned ?? 0);
        const totalTier = hasAppFilter
            ? filteredPerApp.reduce(
                  (sum, row) => sum + (row.tier_earned ?? 0),
                  0,
              )
            : (globalSummary?.tier_earned ?? 0);
        const totalBaseline = hasAppFilter
            ? filteredPerApp.reduce((sum, row) => sum + row.baseline_price, 0)
            : (globalSummary?.baseline_price ?? 0);
        const averageMarkupRate =
            totalBaseline > 0 ? totalPollen / totalBaseline : 0;
        const activeUsers = hasAppFilter
            ? selectedAppKeyIds.length === 1
                ? (filteredPerApp[0]?.unique_users ?? 0)
                : null
            : (globalSummary?.unique_users ?? 0);
        const appCount = filteredPerApp.length;

        const topAppRow = [...filteredPerApp].sort((a, b) => {
            const left =
                filters.metric === "requests" ? a.requests : a.pollen_earned;
            const right =
                filters.metric === "requests" ? b.requests : b.pollen_earned;
            return right - left;
        })[0];
        const topApp: TopApp | null = topAppRow
            ? {
                  id: topAppRow.app_key_id,
                  label: topAppRow.app_name,
                  requests: topAppRow.requests,
                  pollen: topAppRow.pollen_earned,
                  paidPollen: topAppRow.paid_earned ?? topAppRow.pollen_earned,
                  tierPollen: topAppRow.tier_earned ?? 0,
                  uniqueUsers: topAppRow.unique_users,
              }
            : null;

        return {
            totalRequests,
            totalPollen,
            totalPaid,
            totalTier,
            averageMarkupRate,
            activeUsers,
            appCount,
            topApp,
        };
    }, [filteredPerApp, globalSummary, filters.metric, selectedAppKeyIds]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        chartData,
        stats,
    };
}
