import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api.ts";
import type {
    DailyUsageRecord,
    DataPoint,
    FilterState,
    ModelBreakdown,
} from "./types";

type UsageDataResult = {
    loading: boolean;
    error: string | null;
    fetchUsage: () => void;
    usedModels: { id: string; label: string }[];
    usedApiKeys: { id: string; label: string }[];
    chartData: DataPoint[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        tierPollen: number;
        paidPollen: number;
        activeApiKeyCount: number | null;
        topModel: {
            id: string;
            label: string;
            requests: number;
            pollen: number;
        } | null;
    };
};

export function useUsageData(filters: FilterState): UsageDataResult {
    const [dailyUsage, setDailyUsage] = useState<DailyUsageRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { granularity, period } = filters.period;

    const fetchUsage = useCallback(() => {
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
            .$get({ query })
            .then((r) => {
                if (!r.ok)
                    throw new Error(`Failed to fetch usage data: ${r.status}`);
                return r.json() as Promise<{ usage: DailyUsageRecord[] }>;
            })
            .then((data) => {
                setDailyUsage(data.usage);
            })
            .catch((err) => {
                console.error("Usage fetch error:", err);
                setError(err.message || "Failed to load usage data");
                setDailyUsage([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [granularity, period]);

    useEffect(() => {
        fetchUsage();
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
            apiKeyLabels.set(r.api_key_id, r.api_key || r.api_key_id);
        }

        return Array.from(apiKeyLabels.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const { chartData, stats } = useMemo(() => {
        const filtered = dailyUsage.filter((r: DailyUsageRecord) => {
            if (
                filters.selectedKeyIds.length > 0 &&
                !filters.selectedKeyIds.includes(r.api_key_id)
            )
                return false;
            if (
                filters.selectedModels.length > 0 &&
                r.model &&
                !filters.selectedModels.includes(r.model)
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
            byModel: Map<string, { requests: number; pollen: number }>;
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
                byModel: new Map(),
            };
            cur.requests += r.requests || 0;
            cur.pollen += r.cost_usd || 0;

            if (r.meter_source === "tier") {
                cur.tierRequests += r.requests || 0;
                cur.tierPollen += r.cost_usd || 0;
            } else {
                cur.paidRequests += r.requests || 0;
                cur.paidPollen += r.cost_usd || 0;
            }

            if (r.model) {
                const modelData = cur.byModel.get(r.model) || {
                    requests: 0,
                    pollen: 0,
                };
                modelData.requests += r.requests || 0;
                modelData.pollen += r.cost_usd || 0;
                cur.byModel.set(r.model, modelData);
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
                byModel: new Map(),
            };
            const modelBreakdown: ModelBreakdown[] = Array.from(
                d.byModel.entries(),
            )
                .map(([modelId, modelStats]) => ({
                    model: modelId,
                    label: modelId,
                    requests: modelStats.requests,
                    pollen: modelStats.pollen,
                }))
                .sort((a, b) => b.requests - a.requests);

            const tierKey =
                filters.metric === "requests" ? "tierRequests" : "tierPollen";
            const paidKey =
                filters.metric === "requests" ? "paidRequests" : "paidPollen";

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
                value: d[filters.metric],
                tierValue: d[tierKey],
                paidValue: d[paidKey],
                timestamp: date,
                modelBreakdown,
            };
        });

        const totalReq = filtered.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.requests || 0),
            0,
        );
        const totalPollen = filtered.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
            0,
        );
        const tierPollen = filtered
            .filter((r) => r.meter_source === "tier")
            .reduce(
                (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
                0,
            );
        const paidPollen = filtered
            .filter((r) => r.meter_source !== "tier")
            .reduce(
                (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
                0,
            );
        const modelTotals = new Map<
            string,
            { requests: number; pollen: number }
        >();
        const activeApiKeyIds = new Set<string>();
        for (const r of filtered) {
            if (r.api_key_id) activeApiKeyIds.add(r.api_key_id);
            if (!r.model) continue;
            const cur = modelTotals.get(r.model) || {
                requests: 0,
                pollen: 0,
            };
            cur.requests += r.requests || 0;
            cur.pollen += r.cost_usd || 0;
            modelTotals.set(r.model, cur);
        }
        const topModelEntry = Array.from(modelTotals.entries()).sort(
            (left, right) => {
                const leftValue =
                    filters.metric === "requests"
                        ? left[1].requests
                        : left[1].pollen;
                const rightValue =
                    filters.metric === "requests"
                        ? right[1].requests
                        : right[1].pollen;
                return rightValue - leftValue;
            },
        )[0];
        const topModel = topModelEntry
            ? (() => {
                  const [id, modelStats] = topModelEntry;
                  return {
                      id,
                      label: id,
                      requests: modelStats.requests,
                      pollen: modelStats.pollen,
                  };
              })()
            : null;
        return {
            chartData: sorted,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                tierPollen,
                paidPollen,
                activeApiKeyCount:
                    activeApiKeyIds.size > 0 ? activeApiKeyIds.size : null,
                topModel,
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
        stats,
    };
}
