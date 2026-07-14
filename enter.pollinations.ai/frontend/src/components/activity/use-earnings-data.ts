import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    paid_requests: number;
    tier_requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
};

export type EarningsFilterState = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedAppKeyIds: string[];
    selectedModelIds: string[];
};

type TopEarningEntity = {
    id: string;
    label: string;
    requests: number;
    pollen: number;
};

function filterRowsBySelection(
    rows: DeveloperEarningsRow[],
    appKeyIds: string[],
    modelIds: string[],
): DeveloperEarningsRow[] {
    if (appKeyIds.length === 0 && modelIds.length === 0) return rows;
    const appKeyIdSet = new Set(appKeyIds);
    const modelIdSet = new Set(modelIds);
    return rows.filter(
        (row) =>
            (row.source === "byop_markup" && appKeyIdSet.has(row.entity_id)) ||
            (row.source === "community_model" && modelIdSet.has(row.entity_id)),
    );
}

type EarningsDataResult = {
    loading: boolean;
    error: string | null;
    fetchEarnings: () => void;
    usedApps: { id: string; label: string }[];
    usedModels: { id: string; label: string }[];
    chartData: DataPoint[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        totalPaid: number;
        totalTier: number;
        entityCount: number;
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

    const { granularity, period } = filters.period;

    const fetchEarnings = useCallback(() => {
        setLoading(true);
        setError(null);
        setDailyEarnings([]);
        setPerEntity([]);

        const query = { granularity, period };

        apiClient.account.earnings
            .$get({ query })
            .then((r) => {
                if (!r.ok)
                    throw new Error(
                        `Failed to fetch earnings data: ${r.status}`,
                    );
                return r.json() as Promise<{
                    daily: DeveloperEarningsRow[];
                    perEntity: DeveloperEarningsRow[];
                }>;
            })
            .then((data) => {
                setDailyEarnings(data.daily);
                setPerEntity(data.perEntity);
            })
            .catch((err) => {
                console.error("Earnings fetch error:", err);
                setError(err.message || "Failed to load earnings data");
                setDailyEarnings([]);
                setPerEntity([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [granularity, period]);

    useEffect(() => {
        fetchEarnings();
    }, [fetchEarnings]);

    const usedApps = useMemo(() => {
        const appLabels = new Map<string, string>();
        for (const row of perEntity) {
            if (row.source !== "byop_markup" || !row.entity_id) continue;
            if (appLabels.has(row.entity_id)) continue;
            appLabels.set(row.entity_id, row.entity_name);
        }

        return Array.from(appLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [perEntity]);

    const usedModels = useMemo(() => {
        const modelLabels = new Map<string, string>();
        for (const row of perEntity) {
            if (row.source !== "community_model" || !row.entity_id) continue;
            if (modelLabels.has(row.entity_id)) continue;
            modelLabels.set(row.entity_id, row.entity_name);
        }

        return Array.from(modelLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [perEntity]);

    const effectiveAppKeyIds = useMemo(() => {
        const valid = new Set(usedApps.map((app) => app.id));
        return filters.selectedAppKeyIds.filter((id) => valid.has(id));
    }, [usedApps, filters.selectedAppKeyIds]);

    const effectiveModelIds = useMemo(() => {
        const valid = new Set(usedModels.map((model) => model.id));
        return filters.selectedModelIds.filter((id) => valid.has(id));
    }, [usedModels, filters.selectedModelIds]);

    const filteredDailyEarnings = useMemo(
        () =>
            filterRowsBySelection(
                dailyEarnings,
                effectiveAppKeyIds,
                effectiveModelIds,
            ),
        [dailyEarnings, effectiveAppKeyIds, effectiveModelIds],
    );

    const filteredPerEntity = useMemo(
        () =>
            filterRowsBySelection(
                perEntity,
                effectiveAppKeyIds,
                effectiveModelIds,
            ),
        [perEntity, effectiveAppKeyIds, effectiveModelIds],
    );

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
            current.paidRequests += row.paid_requests;
            current.tierRequests += row.tier_requests;
            current.paidPollen += row.paid_earned;
            current.tierPollen += row.tier_earned;

            const entityKey = `${row.source}:${row.entity_id}`;
            const entityData = current.byEntity.get(entityKey) || {
                label: row.entity_name,
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
            (sum, row) => sum + row.paid_earned,
            0,
        );
        const totalTier = filteredPerEntity.reduce(
            (sum, row) => sum + row.tier_earned,
            0,
        );
        const entityCount = filteredPerEntity.length;

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
            topEntity,
        };
    }, [filteredPerEntity, filters.metric]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        usedModels,
        chartData,
        stats,
    };
}
