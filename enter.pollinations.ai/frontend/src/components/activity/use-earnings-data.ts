import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityChartDate } from "./activity-helpers";
import { isInActivityBucket } from "./activity-period";
import type { DataPoint, Metric, UsagePeriodSelection } from "./types";

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

type EarningEntity = {
    id: string;
    source: EarningsSource;
    label: string;
    requests: number;
    pollen: number;
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
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
    hasData: boolean;
    exportRows: DeveloperEarningsRow[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        totalPaid: number;
        totalTier: number;
        paidRequests: number;
        tierRequests: number;
        entityBreakdowns: EarningEntity[];
    };
};

export function useEarningsData(
    filters: EarningsFilterState,
): EarningsDataResult {
    const [dailyEarnings, setDailyEarnings] = useState<DeveloperEarningsRow[]>(
        [],
    );
    const [perEntity, setPerEntity] = useState<DeveloperEarningsRow[]>([]);
    const [loading, setLoading] = useState(true);
    const request = useRef<AbortController | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { granularity, period } = filters.period;

    const fetchEarnings = useCallback(() => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError(null);
        setDailyEarnings([]);
        setPerEntity([]);

        const query = { granularity, period };

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
                if (!controller.signal.aborted) setLoading(false);
            });
    }, [granularity, period]);

    useEffect(() => {
        fetchEarnings();
        return () => request.current?.abort();
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

    const filteredDailyEarnings = useMemo(
        () =>
            filterRowsBySelection(
                dailyEarnings,
                filters.selectedAppKeyIds,
                filters.selectedModelIds,
            ),
        [dailyEarnings, filters.selectedAppKeyIds, filters.selectedModelIds],
    );
    const selectedEarnings = useMemo(
        () =>
            filteredDailyEarnings.filter((row) =>
                isInActivityBucket(row.date, filters.period),
            ),
        [filteredDailyEarnings, filters.period],
    );
    const filteredPerEntity = useMemo(() => {
        const totals = new Map<string, DeveloperEarningsRow>();
        for (const row of selectedEarnings) {
            const key = `${row.source}:${row.entity_id}`;
            const total = totals.get(key);
            if (!total) {
                totals.set(key, { ...row });
                continue;
            }
            total.requests += row.requests;
            total.pollen_earned += row.pollen_earned;
            total.paid_earned += row.paid_earned;
            total.tier_earned += row.tier_earned;
            total.paid_requests += row.paid_requests;
            total.tier_requests += row.tier_requests;
        }
        return Array.from(totals.values());
    }, [selectedEarnings]);

    const chartData = useMemo<DataPoint[]>(() => {
        type DayBucket = {
            requests: number;
            pollen: number;
            paidRequests: number;
            tierRequests: number;
            paidPollen: number;
            tierPollen: number;
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
            };
            current.requests += row.requests;
            current.pollen += row.pollen_earned;
            current.paidRequests += row.paid_requests;
            current.tierRequests += row.tier_requests;
            current.paidPollen += row.paid_earned;
            current.tierPollen += row.tier_earned;

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
            };
            const isRequestsMetric = filters.metric === "requests";

            return {
                ...formatActivityChartDate(date, isHourly),
                value: isRequestsMetric ? bucket.requests : bucket.pollen,
                tierValue: isRequestsMetric
                    ? bucket.tierRequests
                    : bucket.tierPollen,
                paidValue: isRequestsMetric
                    ? bucket.paidRequests
                    : bucket.paidPollen,
                timestamp: date,
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

        const entityBreakdowns: EarningEntity[] = filteredPerEntity
            .map((row) => ({
                id: `${row.source}:${row.entity_id}`,
                source: row.source,
                label: row.entity_name,
                requests: row.requests,
                pollen: row.pollen_earned,
                paidPollen: row.paid_earned,
                tierPollen: row.tier_earned,
                paidRequests: row.paid_requests,
                tierRequests: row.tier_requests,
            }))
            .sort((a, b) => b.pollen - a.pollen);

        return {
            totalRequests,
            totalPollen,
            totalPaid,
            totalTier,
            paidRequests: filteredPerEntity.reduce(
                (sum, row) => sum + row.paid_requests,
                0,
            ),
            tierRequests: filteredPerEntity.reduce(
                (sum, row) => sum + row.tier_requests,
                0,
            ),
            entityBreakdowns,
        };
    }, [filteredPerEntity]);

    return {
        loading,
        error,
        fetchEarnings,
        usedApps,
        usedModels,
        chartData,
        stats,
        exportRows: selectedEarnings,
        hasData: filteredDailyEarnings.length > 0,
    };
}
