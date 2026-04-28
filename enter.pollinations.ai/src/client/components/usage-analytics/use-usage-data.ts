import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_MODELS } from "./constants";
import { getPeriodBucketKeys, periodBucketKeyToDate } from "./period-utils.ts";
import type {
    DailyUsageRecord,
    DataPoint,
    FilterState,
    ModelBreakdown,
} from "./types";

type UsageDataResult = {
    dailyUsage: DailyUsageRecord[];
    loading: boolean;
    error: string | null;
    fetchUsage: () => void;
    usedModels: { id: string; label: string }[];
    chartData: DataPoint[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        tierPollen: number;
        paidPollen: number;
        averagePollenPerRequest: number;
        activeModelCount: number;
        topModel: {
            id: string;
            label: string;
            requests: number;
            pollen: number;
        } | null;
        peakPeriod: {
            label: string;
            value: number;
        } | null;
    };
    filteredData: DailyUsageRecord[];
};

export function useUsageData(filters: FilterState): UsageDataResult {
    const [dailyUsage, setDailyUsage] = useState<DailyUsageRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchUsage = useCallback(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            granularity: filters.period.granularity,
            period: filters.period.period,
        });
        if (filters.selectedKeyIds.length > 0) {
            params.set("api_key_ids", filters.selectedKeyIds.join(","));
        }

        fetch(`/api/account/usage/daily?${params.toString()}`)
            .then((r) => {
                if (!r.ok)
                    throw new Error(`Failed to fetch usage data: ${r.status}`);
                return r.json() as Promise<{ usage: DailyUsageRecord[] }>;
            })
            .then((data) => {
                setDailyUsage(data?.usage || []);
            })
            .catch((err) => {
                console.error("Usage fetch error:", err);
                setError(err.message || "Failed to load usage data");
                setDailyUsage([]);
            })
            .finally(() => setLoading(false));
    }, [
        filters.period.granularity,
        filters.period.period,
        filters.selectedKeyIds,
    ]);

    useEffect(() => {
        fetchUsage();
    }, [fetchUsage]);

    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        for (const r of dailyUsage) {
            if (r.model) modelIds.add(r.model);
        }

        return Array.from(modelIds)
            .map((id) => {
                const registered = ALL_MODELS.find((m) => m.id === id);
                return { id, label: registered?.label || id };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    const { chartData, stats, filteredData } = useMemo(() => {
        const filtered = dailyUsage.filter((r: DailyUsageRecord) => {
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

            const isTier = r.meter_source === "tier";
            if (isTier) {
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
                .map(([modelId, modelStats]) => {
                    const registered = ALL_MODELS.find((m) => m.id === modelId);
                    return {
                        model: modelId,
                        label: registered?.label || modelId,
                        requests: modelStats.requests,
                        pollen: modelStats.pollen,
                    };
                })
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
        for (const r of filtered) {
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
                  const registered = ALL_MODELS.find((m) => m.id === id);
                  return {
                      id,
                      label: registered?.label || id,
                      requests: modelStats.requests,
                      pollen: modelStats.pollen,
                  };
              })()
            : null;
        const peakPeriod = sorted.reduce<{
            label: string;
            value: number;
        } | null>((best, point) => {
            if (point.value <= 0) return best;
            if (!best || point.value > best.value) {
                return { label: point.label, value: point.value };
            }
            return best;
        }, null);

        return {
            chartData: sorted,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                tierPollen,
                paidPollen,
                averagePollenPerRequest:
                    totalReq > 0 ? totalPollen / totalReq : 0,
                activeModelCount: modelTotals.size,
                topModel,
                peakPeriod,
            },
            filteredData: filtered,
        };
    }, [dailyUsage, filters.selectedModels, filters.metric, filters.period]);

    return {
        dailyUsage,
        loading,
        error,
        fetchUsage,
        usedModels,
        chartData,
        stats,
        filteredData,
    };
}
