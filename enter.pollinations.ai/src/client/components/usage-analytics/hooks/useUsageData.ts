import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ALL_MODELS,
    MS_PER_30_DAYS,
    MS_PER_DAY,
    MS_PER_WEEK,
} from "../constants";
import type {
    DailyUsageRecord,
    DataPoint,
    FilterState,
    ModelBreakdown,
} from "../types";

type UsageDataResult = {
    dailyUsage: DailyUsageRecord[];
    loading: boolean;
    error: string | null;
    containerRef: React.RefObject<HTMLDivElement | null>;
    fetchUsage: () => void;
    usedModels: { id: string; label: string }[];
    usedKeys: string[];
    chartData: DataPoint[];
    stats: {
        totalRequests: number;
        totalPollen: number;
        tierPollen: number;
        paidPollen: number;
    };
    filteredData: DailyUsageRecord[];
};

export function useUsageData(filters: FilterState): UsageDataResult {
    const [dailyUsage, setDailyUsage] = useState<DailyUsageRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchUsage = useCallback(() => {
        setLoading(true);
        setError(null);

        fetch("/api/account/usage/daily")
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
    }, []);

    // Lazy load: fetch data only when component comes into view
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchUsage();
                    observer.disconnect();
                }
            },
            { threshold: 0.1 },
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [fetchUsage]);

    // Compute cutoff date based on time range
    const cutoff = useMemo(() => {
        const now = new Date();
        return filters.timeRange === "7d"
            ? new Date(now.getTime() - MS_PER_WEEK)
            : filters.timeRange === "30d"
              ? new Date(now.getTime() - MS_PER_30_DAYS)
              : new Date(0); // "all" - no cutoff
    }, [filters.timeRange]);

    // Time-filtered data (without model/key filters)
    const timeFilteredData = useMemo(() => {
        return dailyUsage.filter((r) => {
            const recordDate = new Date(`${r.date}T00:00:00`);
            return recordDate >= cutoff;
        });
    }, [dailyUsage, cutoff]);

    // Models that appear in time-filtered usage data
    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        for (const r of timeFilteredData) {
            if (r.model) modelIds.add(r.model);
        }

        return Array.from(modelIds)
            .map((id) => {
                const registered = ALL_MODELS.find((m) => m.id === id);
                return { id, label: registered?.label || id };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [timeFilteredData]);

    // API keys that appear in time-filtered usage data
    const usedKeys = useMemo(() => {
        const keyNames = new Set<string>();
        for (const r of timeFilteredData) {
            if (r.api_key_names) {
                for (const name of r.api_key_names) {
                    if (name) keyNames.add(name);
                }
            }
        }
        return Array.from(keyNames).sort();
    }, [timeFilteredData]);

    // Filter and aggregate daily usage data
    const { chartData, stats, filteredData } = useMemo(() => {
        const filtered = dailyUsage.filter((r: DailyUsageRecord) => {
            const recordDate = new Date(`${r.date}T00:00:00`);
            if (recordDate < cutoff) return false;
            if (
                filters.selectedModels.length > 0 &&
                r.model &&
                !filters.selectedModels.includes(r.model)
            )
                return false;
            if (
                filters.selectedKeys.length > 0 &&
                (!r.api_key_names ||
                    !filters.selectedKeys.some((k) =>
                        r.api_key_names.includes(k),
                    ))
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
                // pack + crypto = paid
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

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(
            Math.max(cutoff.getTime(), today.getTime() - 90 * MS_PER_DAY),
        );
        startDate.setHours(0, 0, 0, 0);

        const allDates: string[] = [];
        const currentDate = new Date(startDate);
        while (currentDate <= today) {
            allDates.push(currentDate.toISOString().split("T")[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const sorted = allDates.map((dateStr) => {
            const date = new Date(`${dateStr}T00:00:00`);
            const d = buckets.get(dateStr) || {
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
                label: date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                }),
                fullDate: date.toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
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
        return {
            chartData: sorted,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                tierPollen,
                paidPollen,
            },
            filteredData: filtered,
        };
    }, [dailyUsage, filters, cutoff]);

    return {
        dailyUsage,
        loading,
        error,
        containerRef,
        fetchUsage,
        usedModels,
        usedKeys,
        chartData,
        stats,
        filteredData,
    };
}
