import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    getMockEarningsResponse,
    getMockEarningsScenario,
} from "../../lib/mock-earnings.ts";
import { getPeriodBucketKeys, periodBucketKeyToDate } from "./period-utils.ts";
import type { DataPoint, ModelBreakdown, UsagePeriodSelection } from "./types";

export type DeveloperEarningsRow = {
    date: string;
    app_key_id: string;
    app_name: string;
    requests: number;
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
    chartData: DataPoint[];
    stats: {
        totalPollen: number;
        totalPaid: number;
        totalTier: number;
        averageMarkupRate: number;
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

        // REMOVE BEFORE MERGE — design-only mock short-circuit (see lib/mock-earnings.ts).
        const mockScenario = getMockEarningsScenario();
        if (mockScenario) {
            const mock = getMockEarningsResponse(mockScenario, {
                period: { granularity, period },
                selectedAppKeyIds: selectedAppKeyIdsKey
                    ? selectedAppKeyIdsKey.split(",")
                    : [],
            });
            setDailyEarnings(mock.daily);
            setPerApp(mock.perApp);
            setGlobalSummary(mock.global);
            setLoading(false);
            return;
        }

        const params = new URLSearchParams({
            granularity,
            period,
        });
        if (selectedAppKeyIdsKey) {
            params.set("api_key_ids", selectedAppKeyIdsKey);
        }

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
            tier: number;
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
                tier: 0,
                byApp: new Map(),
            };
            cur.requests += r.requests;
            cur.pollen += r.pollen_earned;
            // If pipe doesn't yet split, fall back to all-paid.
            cur.paid += r.paid_earned ?? r.pollen_earned;
            cur.tier += r.tier_earned ?? 0;

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
                paid: 0,
                tier: 0,
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
                tierValue: d.tier,
                paidValue: d.paid,
                timestamp: date,
                modelBreakdown: appBreakdown,
            };
        });
    }, [dailyEarnings, filters.period]);

    const stats = useMemo(() => {
        const totalPollen = globalSummary?.pollen_earned ?? 0;
        const totalPaid =
            globalSummary?.paid_earned ?? globalSummary?.pollen_earned ?? 0;
        const totalTier = globalSummary?.tier_earned ?? 0;
        const averageMarkupRate = globalSummary?.markup_rate ?? 0;
        const activeUsers = globalSummary?.unique_users ?? 0;
        const appCount = perApp.length;

        const topAppRow = [...perApp].sort(
            (a, b) => b.pollen_earned - a.pollen_earned,
        )[0];
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
            totalPollen,
            totalPaid,
            totalTier,
            averageMarkupRate,
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
