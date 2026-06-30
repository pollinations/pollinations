import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
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
    source: EarningsSource;
    requests: number;
    pollen: number;
    paidPollen: number;
    tierPollen: number;
    uniqueUsers: number;
};

type EarningSourceSummary = {
    source: EarningsSource;
    label: string;
    requests: number;
    pollen: number;
    paidPollen: number;
    tierPollen: number;
    uniqueUsers: number;
    rewardRate: number;
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
        appMarkupPollen: number;
        modelRewardPollen: number;
        sourceSummaries: EarningSourceSummary[];
        entityCount: number;
        appCount: number;
        modelCount: number;
        topEntity: TopEarningEntity | null;
    };
};

export function formatEarningsSourceLabel(source: EarningsSource): string {
    if (source === "byop_markup") return "App markup";
    if (source === "community_model") return "Model reward";
    return source;
}

const emptyTotal: DeveloperEarningsTotal = {
    pollen_earned: 0,
    paid_earned: 0,
    tier_earned: 0,
};

export function useEarningsData(
    filters: EarningsFilterState,
): EarningsDataResult {
    const [dailyEarnings, setDailyEarnings] = useState<DeveloperEarningsRow[]>(
        [],
    );
    const [perEntity, setPerEntity] = useState<DeveloperEarningsRow[]>([]);
    const [bySource, setBySource] = useState<DeveloperEarningsRow[]>([]);
    const [totalSummary, setTotalSummary] =
        useState<DeveloperEarningsTotal>(emptyTotal);
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
        setPerEntity([]);
        setBySource([]);
        setTotalSummary(emptyTotal);

        const query: {
            granularity: string;
            period: string;
            entity_ids?: string;
        } = {
            granularity,
            period,
        };
        if (selectedAppKeyIdsKey) {
            query.entity_ids = selectedAppKeyIdsKey;
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
                    perEntity: DeveloperEarningsRow[];
                    bySource: DeveloperEarningsRow[];
                    total: DeveloperEarningsTotal;
                }>;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                setDailyEarnings(data.daily);
                setPerEntity(data.perEntity);
                setBySource(data.bySource);
                setTotalSummary(data.total);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error("Earnings fetch error:", err);
                setError(err.message || "Failed to load earnings data");
                setDailyEarnings([]);
                setPerEntity([]);
                setBySource([]);
                setTotalSummary(emptyTotal);
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

        for (const row of dailyEarnings) {
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
                label: `${formatEarningsSourceLabel(row.source)}: ${row.entity_name}`,
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
    }, [dailyEarnings, filters.metric, filters.period]);

    const stats = useMemo(() => {
        const totalRequests = bySource.reduce(
            (sum, row) => sum + row.requests,
            0,
        );
        const totalPollen = totalSummary.pollen_earned;
        const totalPaid = totalSummary.paid_earned;
        const totalTier = totalSummary.tier_earned;
        const appMarkupPollen =
            bySource.find((row) => row.source === "byop_markup")
                ?.pollen_earned ?? 0;
        const modelRewardPollen =
            bySource.find((row) => row.source === "community_model")
                ?.pollen_earned ?? 0;
        const sourceSummaries = bySource.map((row) => ({
            source: row.source,
            label: formatEarningsSourceLabel(row.source),
            requests: row.requests,
            pollen: row.pollen_earned,
            paidPollen: row.paid_earned ?? row.pollen_earned,
            tierPollen: row.tier_earned ?? 0,
            uniqueUsers: row.unique_users,
            rewardRate: row.reward_rate,
        }));
        const entityCount = perEntity.length;
        const appCount = perEntity.filter(
            (row) => row.source === "byop_markup",
        ).length;
        const modelCount = perEntity.filter(
            (row) => row.source === "community_model",
        ).length;

        const topEntityRow = [...perEntity].sort((a, b) => {
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
                  source: topEntityRow.source,
                  requests: topEntityRow.requests,
                  pollen: topEntityRow.pollen_earned,
                  paidPollen:
                      topEntityRow.paid_earned ?? topEntityRow.pollen_earned,
                  tierPollen: topEntityRow.tier_earned ?? 0,
                  uniqueUsers: topEntityRow.unique_users,
              }
            : null;

        return {
            totalRequests,
            totalPollen,
            totalPaid,
            totalTier,
            appMarkupPollen,
            modelRewardPollen,
            sourceSummaries,
            entityCount,
            appCount,
            modelCount,
            topEntity,
        };
    }, [perEntity, bySource, totalSummary, filters.metric]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        chartData,
        stats,
    };
}
