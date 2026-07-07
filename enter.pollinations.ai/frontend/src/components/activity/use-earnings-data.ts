import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import type { DataPoint, ModelBreakdown, UsagePeriodSelection } from "./types";

export type DeveloperEarningsRow = {
    date: string;
    entity_id: string;
    entity_name: string;
    source: EarningsSource;
    requests: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    reward_rate: number;
    unique_users: number;
};

export type DeveloperEarningsTotal = {
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
};

export type EarningsSource = "byop_markup" | "community_model";

export type EarningsFilterState = {
    period: UsagePeriodSelection;
    selectedEntityIds: string[];
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
    chartData: DataPoint[];
    stats: {
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

    const selectedEntityIdsKey = filters.selectedEntityIds.join(",");
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
        if (selectedEntityIdsKey) {
            query.entity_ids = selectedEntityIdsKey;
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
    }, [granularity, period, selectedEntityIdsKey]);

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
            byEntity: Map<
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
                byEntity: new Map(),
            };
            cur.requests += r.requests;
            cur.pollen += r.pollen_earned;
            cur.paid += r.paid_earned;
            cur.tier += r.tier_earned;

            const entityKey = `${r.source}:${r.entity_id}`;
            const entityData = cur.byEntity.get(entityKey) || {
                label: `${formatEarningsSourceLabel(r.source)}: ${r.entity_name}`,
                requests: 0,
                pollen: 0,
            };
            entityData.requests += r.requests;
            entityData.pollen += r.pollen_earned;
            cur.byEntity.set(entityKey, entityData);
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
                byEntity: new Map<
                    string,
                    { label: string; requests: number; pollen: number }
                >(),
            };
            const entityBreakdown: ModelBreakdown[] = Array.from(
                d.byEntity.entries(),
            )
                .map(([entityKey, entityStats]) => ({
                    model: entityKey,
                    label: entityStats.label,
                    requests: entityStats.requests,
                    pollen: entityStats.pollen,
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
                modelBreakdown: entityBreakdown,
            };
        });
    }, [dailyEarnings, filters.period]);

    const stats = useMemo(() => {
        const totalPollen = totalSummary.pollen_earned;
        const totalPaid = totalSummary.paid_earned;
        const totalTier = totalSummary.tier_earned;
        const appMarkupPollen =
            bySource.find((r) => r.source === "byop_markup")?.pollen_earned ??
            0;
        const modelRewardPollen =
            bySource.find((r) => r.source === "community_model")
                ?.pollen_earned ?? 0;
        const sourceSummaries = bySource.map((row) => ({
            source: row.source,
            label: formatEarningsSourceLabel(row.source),
            requests: row.requests,
            pollen: row.pollen_earned,
            paidPollen: row.paid_earned,
            tierPollen: row.tier_earned,
            uniqueUsers: row.unique_users,
            rewardRate: row.reward_rate,
        }));
        const entityCount = perEntity.length;
        const appCount = perEntity.filter(
            (r) => r.source === "byop_markup",
        ).length;
        const modelCount = perEntity.filter(
            (r) => r.source === "community_model",
        ).length;

        const topEntityRow = [...perEntity].sort(
            (a, b) => b.pollen_earned - a.pollen_earned,
        )[0];
        const topEntity: TopEarningEntity | null = topEntityRow
            ? {
                  id: topEntityRow.entity_id,
                  label: topEntityRow.entity_name,
                  source: topEntityRow.source,
                  requests: topEntityRow.requests,
                  pollen: topEntityRow.pollen_earned,
                  paidPollen: topEntityRow.paid_earned,
                  tierPollen: topEntityRow.tier_earned,
                  uniqueUsers: topEntityRow.unique_users,
              }
            : null;

        return {
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
    }, [perEntity, bySource, totalSummary]);

    return {
        loading,
        error,
        fetchEarnings,
        chartData,
        stats,
    };
}
