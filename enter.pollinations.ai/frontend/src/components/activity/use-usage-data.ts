import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accountClient } from "../../api.ts";
import { formatActivityChartDate } from "./activity-helpers";
import { activityTimezone, isInActivityBucket } from "./activity-period";
import type {
    DailyUsageRecord,
    DataPoint,
    FilterState,
    UsageGroupBy,
} from "./types";

type UsageTotals = {
    id: string;
    label: string;
    requests: number;
    pollen: number;
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
};

type UsageDataResult = {
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    fetchUsage: () => void;
    usedModels: { id: string; label: string }[];
    usedApiKeys: { id: string; label: string }[];
    chartData: DataPoint[];
    hasData: boolean;
    hasPeriodData: boolean;
    stats: {
        totalRequests: number;
        totalPollen: number;
        tierPollen: number;
        paidPollen: number;
        paidRequests: number;
        tierRequests: number;
        breakdowns: UsageTotals[];
    };
};

const EMPTY_USAGE: DailyUsageRecord[] = [];

export function useUsageData(
    filters: FilterState,
    groupBy: UsageGroupBy,
): UsageDataResult {
    const { granularity, period } = filters.period;
    const requestKey = `${granularity}:${period}`;
    const [result, setResult] = useState<{
        key: string;
        rows: DailyUsageRecord[];
    } | null>(null);
    const [status, setStatus] = useState({
        key: requestKey,
        pending: true,
        error: null as string | null,
    });
    const request = useRef<AbortController | null>(null);
    const hasLoaded = result?.key === requestKey;
    const dailyUsage = hasLoaded ? result.rows : EMPTY_USAGE;
    const pending = status.key !== requestKey || status.pending;
    const loading = pending && !hasLoaded;
    const refreshing = pending && hasLoaded;
    const error = status.key === requestKey ? status.error : null;

    const fetchUsage = useCallback(() => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setStatus({ key: requestKey, pending: true, error: null });
        return accountClient.usage.daily
            .$get(
                {
                    query: {
                        granularity,
                        period,
                        timezone: activityTimezone(),
                    },
                },
                { init: { signal: controller.signal } },
            )
            .then((r) => {
                if (!r.ok) throw new Error(`Failed to load usage: ${r.status}`);
                return r.json() as Promise<{ usage: DailyUsageRecord[] }>;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                setResult({ key: requestKey, rows: data.usage });
                setStatus({ key: requestKey, pending: false, error: null });
            })
            .catch((err) => {
                if (!controller.signal.aborted)
                    setStatus({
                        key: requestKey,
                        pending: false,
                        error: err.message || "Couldn’t load usage.",
                    });
            });
    }, [granularity, period, requestKey]);

    useEffect(() => {
        fetchUsage();
        return () => request.current?.abort();
    }, [fetchUsage]);

    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        for (const r of dailyUsage) {
            modelIds.add(r.model || "");
        }

        return Array.from(modelIds)
            .map((id) => ({ id, label: id || "Unknown model" }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const usedApiKeys = useMemo(() => {
        const apiKeyLabels = new Map<string, string>();
        for (const r of dailyUsage) {
            if (apiKeyLabels.has(r.api_key_id)) continue;
            apiKeyLabels.set(r.api_key_id, r.api_key || "Unnamed key");
        }

        const labelCounts = new Map<string, number>();
        for (const label of apiKeyLabels.values()) {
            labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
        }
        return Array.from(apiKeyLabels.entries())
            .map(([id, label]) => ({
                id,
                label:
                    (labelCounts.get(label) ?? 0) > 1
                        ? `${label} (${id})`
                        : label,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const { chartData, stats, hasData } = useMemo(() => {
        const selectedKeyIds = filters.selectedKeyIds;
        const selectedModels = filters.selectedModels;
        const filtered = dailyUsage.filter((r: DailyUsageRecord) => {
            if (
                selectedKeyIds.length > 0 &&
                !selectedKeyIds.includes(r.api_key_id)
            )
                return false;
            if (
                selectedModels.length > 0 &&
                !selectedModels.includes(r.model ?? "")
            )
                return false;
            return true;
        });

        type DayBucket = {
            requests: number;
            pollen: number;
            tierRequests: number;
            tierPollen: number;
            paidRequests: number;
            paidPollen: number;
        };
        const buckets = new Map<string, DayBucket>();

        filtered.forEach((r: DailyUsageRecord) => {
            const dateKey = r.date;
            const cur = buckets.get(dateKey) || {
                requests: 0,
                pollen: 0,
                tierRequests: 0,
                tierPollen: 0,
                paidRequests: 0,
                paidPollen: 0,
            };
            cur.requests += r.requests || 0;
            cur.pollen += r.cost_usd || 0;

            if (r.meter_source === "tier") {
                cur.tierRequests += r.requests || 0;
                cur.tierPollen += r.cost_usd || 0;
            } else if (r.meter_source === "pack") {
                cur.paidRequests += r.requests || 0;
                cur.paidPollen += r.cost_usd || 0;
            }

            buckets.set(dateKey, cur);
        });

        const isHourly = filters.period.granularity === "day";
        const bucketKeys = getPeriodBucketKeys(filters.period);

        const sorted = bucketKeys.map((bucketKey) => {
            const date = periodBucketKeyToDate(
                bucketKey,
                filters.period.granularity,
            );
            const d = buckets.get(bucketKey) || {
                requests: 0,
                pollen: 0,
                tierRequests: 0,
                tierPollen: 0,
                paidRequests: 0,
                paidPollen: 0,
            };
            const tierKey =
                filters.metric === "requests" ? "tierRequests" : "tierPollen";
            const paidKey =
                filters.metric === "requests" ? "paidRequests" : "paidPollen";

            return {
                ...formatActivityChartDate(date, isHourly),
                value: d[filters.metric],
                tierValue: d[tierKey],
                paidValue: d[paidKey],
                timestamp: date,
            };
        });

        const selectedRows = filtered.filter((row) =>
            isInActivityBucket(row.date, filters.period),
        );
        const totalReq = selectedRows.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.requests || 0),
            0,
        );
        const totalPollen = selectedRows.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
            0,
        );
        const tierPollen = selectedRows
            .filter((r) => r.meter_source === "tier")
            .reduce(
                (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
                0,
            );
        const paidPollen = selectedRows
            .filter((r) => r.meter_source === "pack")
            .reduce(
                (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
                0,
            );
        const keyLabels = new Map(
            usedApiKeys.map(({ id, label }) => [id, label]),
        );
        const totalsByGroup = new Map<string, UsageTotals>();
        for (const r of selectedRows) {
            const id = groupBy === "key" ? r.api_key_id : (r.model ?? "");
            const cur = totalsByGroup.get(id) || {
                id,
                label:
                    groupBy === "key"
                        ? (keyLabels.get(id) ?? id)
                        : id || "Unknown model",
                requests: 0,
                pollen: 0,
                paidPollen: 0,
                tierPollen: 0,
                paidRequests: 0,
                tierRequests: 0,
            };
            cur.requests += r.requests || 0;
            cur.pollen += r.cost_usd || 0;
            if (r.meter_source === "tier") {
                cur.tierPollen += r.cost_usd || 0;
                cur.tierRequests += r.requests || 0;
            } else if (r.meter_source === "pack") {
                cur.paidPollen += r.cost_usd || 0;
                cur.paidRequests += r.requests || 0;
            }
            totalsByGroup.set(id, cur);
        }
        const breakdowns = Array.from(totalsByGroup.values()).sort(
            (a, b) => b[filters.metric] - a[filters.metric],
        );
        return {
            chartData: sorted,
            hasData: filtered.length > 0,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                tierPollen,
                paidPollen,
                paidRequests: selectedRows.reduce(
                    (sum, row) =>
                        sum + (row.meter_source === "pack" ? row.requests : 0),
                    0,
                ),
                tierRequests: selectedRows.reduce(
                    (sum, row) =>
                        sum + (row.meter_source === "tier" ? row.requests : 0),
                    0,
                ),
                breakdowns,
            },
        };
    }, [
        dailyUsage,
        usedApiKeys,
        groupBy,
        filters.selectedKeyIds,
        filters.selectedModels,
        filters.metric,
        filters.period,
    ]);

    return {
        loading,
        refreshing,
        error,
        fetchUsage,
        usedModels,
        usedApiKeys,
        chartData,
        hasData,
        stats,
        hasPeriodData: dailyUsage.length > 0,
    };
}
