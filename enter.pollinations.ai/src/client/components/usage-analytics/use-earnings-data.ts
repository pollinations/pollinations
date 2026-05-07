import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPeriodBucketKeys, periodBucketKeyToDate } from "./period-utils.ts";
import type { DataPoint, ModelBreakdown, UsagePeriodSelection } from "./types";

export type DeveloperEarningsRow = {
    date: string;
    app_key_id: string;
    app_name: string;
    requests: number;
    pollen_earned: number;
    markup_rate: number;
    unique_users: number;
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
    uniqueUsers: number;
};

type EarningsDataResult = {
    loading: boolean;
    error: string | null;
    fetchEarnings: () => void;
    usedApps: { id: string; label: string }[];
    chartData: DataPoint[];
    stats: {
        totalPollen: number;
        averageMarkupRate: number;
        // null when a multi-app subset is selected — distinct user counts
        // can't be aggregated client-side without overcount.
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

    const fetchEarnings = useCallback(() => {
        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;

        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            granularity: filters.period.granularity,
            period: filters.period.period,
        });

        fetch(`/api/account/earnings?${params.toString()}`, {
            signal: controller.signal,
        })
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
    }, [filters.period.granularity, filters.period.period]);

    useEffect(() => {
        fetchEarnings();
        return () => {
            inFlightRef.current?.abort();
        };
    }, [fetchEarnings]);

    const usedApps = useMemo(() => {
        const seen = new Map<string, string>();
        for (const r of dailyEarnings) {
            if (!r.app_key_id) continue;
            if (!seen.has(r.app_key_id)) {
                seen.set(r.app_key_id, r.app_name || r.app_key_id);
            }
        }
        return Array.from(seen.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyEarnings]);

    const chartData = useMemo<DataPoint[]>(() => {
        const filtered = dailyEarnings.filter((r) => {
            if (
                filters.selectedAppKeyIds.length > 0 &&
                !filters.selectedAppKeyIds.includes(r.app_key_id)
            )
                return false;
            return true;
        });

        type DayBucket = {
            requests: number;
            pollen: number;
            byApp: Map<
                string,
                { label: string; requests: number; pollen: number }
            >;
        };
        const buckets = new Map<string, DayBucket>();

        for (const r of filtered) {
            const dateKey = r.date;
            const cur = buckets.get(dateKey) || {
                requests: 0,
                pollen: 0,
                byApp: new Map(),
            };
            cur.requests += r.requests;
            cur.pollen += r.pollen_earned;

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
                tierValue: 0,
                paidValue: d.pollen,
                timestamp: date,
                modelBreakdown: appBreakdown,
            };
        });
    }, [dailyEarnings, filters.selectedAppKeyIds, filters.period]);

    const stats = useMemo(() => {
        const visiblePerApp =
            filters.selectedAppKeyIds.length > 0
                ? perApp.filter((r) =>
                      filters.selectedAppKeyIds.includes(r.app_key_id),
                  )
                : perApp;

        const useGlobal =
            filters.selectedAppKeyIds.length === 0 && globalSummary != null;

        const totalPollen = useGlobal
            ? globalSummary.pollen_earned
            : visiblePerApp.reduce((s, r) => s + r.pollen_earned, 0);
        const averageMarkupRate = useGlobal
            ? globalSummary.markup_rate
            : (() => {
                  const totalReq = visiblePerApp.reduce(
                      (s, r) => s + r.requests,
                      0,
                  );
                  if (totalReq === 0) return 0;
                  const weighted = visiblePerApp.reduce(
                      (s, r) => s + r.markup_rate * r.requests,
                      0,
                  );
                  return weighted / totalReq;
              })();
        // Distinct payers only roll up correctly for a single app or
        // across all apps (the global rollup row). For a 2+ app subset
        // we'd need a server-side query — return null so the UI can
        // render an em dash instead of a misleading zero.
        const activeUsers: number | null = useGlobal
            ? globalSummary.unique_users
            : visiblePerApp.length === 1
              ? visiblePerApp[0].unique_users
              : null;
        const appCount = visiblePerApp.length;

        const topAppRow = visiblePerApp.toSorted(
            (a, b) => b.pollen_earned - a.pollen_earned,
        )[0];
        const topApp: TopApp | null = topAppRow
            ? {
                  id: topAppRow.app_key_id,
                  label: topAppRow.app_name,
                  requests: topAppRow.requests,
                  pollen: topAppRow.pollen_earned,
                  uniqueUsers: topAppRow.unique_users,
              }
            : null;

        return {
            totalPollen,
            averageMarkupRate,
            activeUsers,
            appCount,
            topApp,
        };
    }, [perApp, globalSummary, filters.selectedAppKeyIds]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        chartData,
        stats,
    };
}
