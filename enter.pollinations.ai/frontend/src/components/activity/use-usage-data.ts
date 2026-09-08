import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityChartDate } from "./activity-helpers";
import { isInActivityBucket } from "./activity-period";
import type {
    DailyUsageRecord,
    DataPoint,
    FilterState,
    ModelBreakdown,
} from "./types";

type UsageModelBreakdown = ModelBreakdown & {
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
};

type UsageDataResult = {
    loading: boolean;
    error: string | null;
    fetchUsage: () => void;
    usedModels: { id: string; label: string }[];
    usedApiKeys: { id: string; label: string }[];
    chartData: DataPoint[];
    hasData: boolean;
    exportRows: DailyUsageRecord[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        tierPollen: number;
        paidPollen: number;
        paidRequests: number;
        tierRequests: number;
        modelBreakdowns: UsageModelBreakdown[];
    };
};

export function useUsageData(filters: FilterState): UsageDataResult {
    const [dailyUsage, setDailyUsage] = useState<DailyUsageRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const request = useRef<AbortController | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { granularity, period } = filters.period;

    const fetchUsage = useCallback(() => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setDailyUsage([]);
        setLoading(true);
        setError(null);

        const query: {
            granularity: string;
            period: string;
        } = {
            granularity,
            period,
        };

        apiClient.account.usage.daily
            .$get({ query }, { init: { signal: controller.signal } })
            .then((r) => {
                if (!r.ok)
                    throw new Error(`Failed to fetch usage data: ${r.status}`);
                return r.json() as Promise<{ usage: DailyUsageRecord[] }>;
            })
            .then((data) => {
                if (!controller.signal.aborted) setDailyUsage(data.usage);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error("Usage fetch error:", err);
                setError(err.message || "Failed to load usage data");
                setDailyUsage([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
    }, [granularity, period]);

    useEffect(() => {
        fetchUsage();
        return () => request.current?.abort();
    }, [fetchUsage]);

    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        for (const r of dailyUsage) {
            if (r.model) modelIds.add(r.model);
        }

        return Array.from(modelIds)
            .map((id) => ({ id, label: id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const usedApiKeys = useMemo(() => {
        const apiKeyLabels = new Map<string, string>();
        for (const r of dailyUsage) {
            if (apiKeyLabels.has(r.api_key_id)) continue;
            apiKeyLabels.set(r.api_key_id, r.api_key || "Unnamed key");
        }

        return Array.from(apiKeyLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const { chartData, stats, exportRows, hasData } = useMemo(() => {
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
            .filter((r) => r.meter_source !== "tier")
            .reduce(
                (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
                0,
            );
        const modelTotals = new Map<
            string,
            {
                requests: number;
                pollen: number;
                paidPollen: number;
                tierPollen: number;
                paidRequests: number;
                tierRequests: number;
            }
        >();
        for (const r of selectedRows) {
            if (!r.model) continue;
            const cur = modelTotals.get(r.model) || {
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
            } else {
                cur.paidPollen += r.cost_usd || 0;
                cur.paidRequests += r.requests || 0;
            }
            modelTotals.set(r.model, cur);
        }
        const modelBreakdowns: UsageModelBreakdown[] = Array.from(
            modelTotals.entries(),
        )
            .map(([model, totals]) => ({ model, label: model, ...totals }))
            .sort((a, b) => b[filters.metric] - a[filters.metric]);
        return {
            chartData: sorted,
            hasData: filtered.length > 0,
            exportRows: selectedRows,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                tierPollen,
                paidPollen,
                paidRequests: selectedRows.reduce(
                    (sum, row) =>
                        sum + (row.meter_source !== "tier" ? row.requests : 0),
                    0,
                ),
                tierRequests: selectedRows.reduce(
                    (sum, row) =>
                        sum + (row.meter_source === "tier" ? row.requests : 0),
                    0,
                ),
                modelBreakdowns,
            },
        };
    }, [
        dailyUsage,
        filters.selectedKeyIds,
        filters.selectedModels,
        filters.metric,
        filters.period,
    ]);

    return {
        loading,
        error,
        fetchUsage,
        usedModels,
        usedApiKeys,
        chartData,
        hasData,
        stats,
        exportRows,
    };
}
