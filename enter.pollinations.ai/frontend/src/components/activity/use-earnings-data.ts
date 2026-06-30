import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    getMockEarningsData,
    isActivityMockEnabled,
} from "./mock-activity-data";
import type {
    DataPoint,
    Metric,
    ModelBreakdown,
    UsagePeriodSelection,
} from "./types";

export type EarningsSource = "byop_markup" | "community_model";

export type DeveloperEarningsRow = {
    date: string;
    entity_id: string;
    entity_name: string;
    source: EarningsSource;
    requests: number;
    paid_requests?: number;
    tier_requests?: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned?: number;
    tier_earned?: number;
    cost_usd: number;
    reward_rate: number;
    unique_users: number;
};

export type DeveloperEarningsTotal = {
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
};

export type EarningsFilterState = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedAppKeyIds: string[];
};

type TopEarningEntity = {
    id: string;
    label: string;
    requests: number;
    pollen: number;
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
        entityCount: number;
        appCount: number;
        topEntity: TopEarningEntity | null;
    };
};

export function useEarningsData(
    filters: EarningsFilterState,
): EarningsDataResult {
    const [dailyEarnings, setDailyEarnings] = useState<DeveloperEarningsRow[]>(
        [],
    );
    const [perEntity, setPerEntity] = useState<DeveloperEarningsRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);

    const selectedAppKeyIdsKey = filters.selectedAppKeyIds.join(",");
    const { granularity, period } = filters.period;
    const mockEnabled = isActivityMockEnabled();

    const fetchEarnings = useCallback(() => {
        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;

        setLoading(true);
        setError(null);
        setDailyEarnings([]);
        setPerEntity([]);

        if (mockEnabled) {
            const mockData = getMockEarningsData({ granularity, period }, []);
            setDailyEarnings(mockData.daily);
            setPerEntity(mockData.perEntity);
            setLoading(false);
            return;
        }

        const query: {
            granularity: string;
            period: string;
            entity_ids?: string;
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
                    perEntity: DeveloperEarningsRow[];
                    bySource: DeveloperEarningsRow[];
                    total: DeveloperEarningsTotal;
                }>;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                setDailyEarnings(data.daily);
                setPerEntity(data.perEntity);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error("Earnings fetch error:", err);
                setError(err.message || "Failed to load earnings data");
                setDailyEarnings([]);
                setPerEntity([]);
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setLoading(false);
            });
    }, [granularity, mockEnabled, period]);

    useEffect(() => {
        fetchEarnings();
        return () => {
            inFlightRef.current?.abort();
        };
    }, [fetchEarnings]);

    const usedApps = useMemo(() => {
        const appLabels = new Map<string, string>();
        for (const row of perEntity) {
            if (row.source !== "byop_markup" || !row.entity_id) continue;
            if (appLabels.has(row.entity_id)) continue;
            appLabels.set(row.entity_id, row.entity_name || row.entity_id);
        }

        return Array.from(appLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [perEntity]);

    const filteredDailyEarnings = useMemo(() => {
        if (!selectedAppKeyIdsKey) return dailyEarnings;
        const selectedAppKeyIds = new Set(selectedAppKeyIdsKey.split(","));
        return dailyEarnings.filter((row) =>
            selectedAppKeyIds.has(row.entity_id),
        );
    }, [dailyEarnings, selectedAppKeyIdsKey]);

    const filteredPerEntity = useMemo(() => {
        if (!selectedAppKeyIdsKey) return perEntity;
        const selectedAppKeyIds = new Set(selectedAppKeyIdsKey.split(","));
        return perEntity.filter((row) => selectedAppKeyIds.has(row.entity_id));
    }, [perEntity, selectedAppKeyIdsKey]);

    const chartData = useMemo<DataPoint[]>(() => {
        type DayBucket = {
            requests: number;
            pollen: number;
            paidRequests: number;
            tierRequests: number;
            paidPollen: number;
            tierPollen: number;
            byEntity: Map<
                string,
                { label: string; requests: number; pollen: number }
            >;
        };
        const buckets = new Map<string, DayBucket>();

        for (const row of filteredDailyEarnings) {
            const current = buckets.get(row.date) || {
                requests: 0,
                pollen: 0,
                paidRequests: 0,
                tierRequests: 0,
                paidPollen: 0,
                tierPollen: 0,
                byEntity: new Map(),
            };
            current.requests += row.requests;
            current.pollen += row.pollen_earned;
            current.paidRequests += row.paid_requests ?? row.requests;
            current.tierRequests += row.tier_requests ?? 0;
            current.paidPollen += row.paid_earned ?? row.pollen_earned;
            current.tierPollen += row.tier_earned ?? 0;

            const entityKey = `${row.source}:${row.entity_id}`;
            const entityData = current.byEntity.get(entityKey) || {
                label: row.entity_name || row.entity_id,
                requests: 0,
                pollen: 0,
            };
            entityData.requests += row.requests;
            entityData.pollen += row.pollen_earned;
            current.byEntity.set(entityKey, entityData);
            buckets.set(row.date, current);
        }

        const isHourly = filters.period.granularity === "day";
        const bucketKeys = getPeriodBucketKeys(filters.period);

        return bucketKeys.map((bucketKey) => {
            const date = periodBucketKeyToDate(
                bucketKey,
                filters.period.granularity,
            );
            const bucket = buckets.get(bucketKey) || {
                requests: 0,
                pollen: 0,
                paidRequests: 0,
                tierRequests: 0,
                paidPollen: 0,
                tierPollen: 0,
                byEntity: new Map<
                    string,
                    { label: string; requests: number; pollen: number }
                >(),
            };
            const entityBreakdown: ModelBreakdown[] = Array.from(
                bucket.byEntity.entries(),
            )
                .map(([entityKey, entityStats]) => ({
                    model: entityKey,
                    label: entityStats.label,
                    requests: entityStats.requests,
                    pollen: entityStats.pollen,
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
                value: isRequestsMetric ? bucket.requests : bucket.pollen,
                tierValue: isRequestsMetric
                    ? bucket.tierRequests
                    : bucket.tierPollen,
                paidValue: isRequestsMetric
                    ? bucket.paidRequests
                    : bucket.paidPollen,
                timestamp: date,
                modelBreakdown: entityBreakdown,
            };
        });
    }, [filteredDailyEarnings, filters.metric, filters.period]);

    const stats = useMemo(() => {
        const totalRequests = filteredPerEntity.reduce(
            (sum, row) => sum + row.requests,
            0,
        );
        const totalPollen = filteredPerEntity.reduce(
            (sum, row) => sum + row.pollen_earned,
            0,
        );
        const totalPaid = filteredPerEntity.reduce(
            (sum, row) => sum + (row.paid_earned ?? row.pollen_earned),
            0,
        );
        const totalTier = filteredPerEntity.reduce(
            (sum, row) => sum + (row.tier_earned ?? 0),
            0,
        );
        const entityCount = filteredPerEntity.length;
        const appCount = filteredPerEntity.filter(
            (row) => row.source === "byop_markup",
        ).length;

        const topEntityRow = [...filteredPerEntity].sort((a, b) => {
            const left =
                filters.metric === "requests" ? a.requests : a.pollen_earned;
            const right =
                filters.metric === "requests" ? b.requests : b.pollen_earned;
            return right - left;
        })[0];
        const topEntity: TopEarningEntity | null = topEntityRow
            ? {
                  id: topEntityRow.entity_id,
                  label: topEntityRow.entity_name,
                  requests: topEntityRow.requests,
                  pollen: topEntityRow.pollen_earned,
              }
            : null;

        return {
            totalRequests,
            totalPollen,
            totalPaid,
            totalTier,
            entityCount,
            appCount,
            topEntity,
        };
    }, [filteredPerEntity, filters.metric]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        chartData,
        stats,
    };
}
