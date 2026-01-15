import type { FC } from "react";
import { useState } from "react";
import { Chart } from "./components/Chart";
import { FilterButton } from "./components/FilterButton";
import { MultiSelect } from "./components/MultiSelect";
import { Stat } from "./components/Stat";
import { useUsageData } from "./hooks/useUsageData";
import type { DailyUsageRecord, FilterState, Metric, TimeRange } from "./types";

export const UsageGraph: FC = () => {
    const [filters, setFilters] = useState<FilterState>({
        timeRange: "7d",
        customDays: 14,
        metric: "pollen",
        selectedKeys: [],
        selectedModels: [],
    });

    const {
        loading,
        error,
        containerRef,
        fetchUsage,
        usedModels,
        usedKeys,
        chartData,
        stats,
        filteredData,
    } = useUsageData(filters);

    const formatTokens = (n: number) =>
        n >= 1e6
            ? `${(n / 1e6).toFixed(1)}M`
            : n >= 1e3
              ? `${(n / 1e3).toFixed(1)}K`
              : n.toString();

    const keySelectOptions = usedKeys.map((name) => ({
        value: name,
        label: name,
    }));

    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));

    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <div ref={containerRef} className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">Usage</h2>
            </div>
            <div className="bg-violet-50/30 rounded-2xl p-6 border border-violet-300">
                {loading && (
                    <div className="flex items-center justify-center h-[180px]">
                        <p className="text-sm text-gray-400 animate-[pulse_2s_ease-in-out_infinite]">
                            Fetching usage data…
                        </p>
                    </div>
                )}
                {error && !loading && (
                    <div className="flex items-center justify-center h-[180px] rounded-xl bg-red-50 border border-dashed border-red-200">
                        <div className="text-center">
                            <p className="text-sm text-red-500 font-medium">
                                {error}
                            </p>
                            <button
                                type="button"
                                onClick={() => fetchUsage()}
                                className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )}
                {!loading && !error && (
                    <>
                        {/* Filters Row 1: Time Range + Metric */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-gray-500 mr-1">
                                    Last
                                </span>
                                {(["7d", "30d", "all"] as TimeRange[]).map(
                                    (t) => (
                                        <FilterButton
                                            key={t}
                                            active={filters.timeRange === t}
                                            onClick={() =>
                                                setFilters((f) => ({
                                                    ...f,
                                                    timeRange: t,
                                                }))
                                            }
                                        >
                                            {t === "7d"
                                                ? "7 days"
                                                : t === "30d"
                                                  ? "30 days"
                                                  : "90 days"}
                                        </FilterButton>
                                    ),
                                )}
                                <FilterButton
                                    active={filters.timeRange === "custom"}
                                    onClick={() =>
                                        setFilters((f) => ({
                                            ...f,
                                            timeRange: "custom",
                                        }))
                                    }
                                >
                                    Custom
                                </FilterButton>
                                {filters.timeRange === "custom" && (
                                    <div className="flex items-center gap-1.5 ml-1">
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={filters.customDays}
                                            onChange={(e) =>
                                                setFilters((f) => ({
                                                    ...f,
                                                    customDays: Math.max(
                                                        1,
                                                        Math.min(
                                                            365,
                                                            parseInt(
                                                                e.target.value,
                                                                10,
                                                            ) || 1,
                                                        ),
                                                    ),
                                                }))
                                            }
                                            className="w-14 px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white text-green-950 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 tabular-nums"
                                        />
                                        <span className="text-xs text-gray-500">
                                            days
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-1.5 items-center">
                                <span className="text-xs font-medium text-gray-500 mr-1">
                                    Type
                                </span>
                                {(
                                    ["requests", "pollen", "tokens"] as Metric[]
                                ).map((m) => (
                                    <FilterButton
                                        key={m}
                                        active={filters.metric === m}
                                        onClick={() =>
                                            setFilters((f) => ({
                                                ...f,
                                                metric: m,
                                            }))
                                        }
                                    >
                                        {m === "requests"
                                            ? "Requests"
                                            : m === "pollen"
                                              ? "Pollen"
                                              : "Tokens"}
                                    </FilterButton>
                                ))}
                            </div>
                        </div>

                        {/* Filters Row 2: Dropdowns */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <MultiSelect
                                options={modelSelectOptions}
                                selected={filters.selectedModels}
                                onChange={(v) =>
                                    setFilters((f) => ({
                                        ...f,
                                        selectedModels: v,
                                    }))
                                }
                                placeholder="All"
                                disabled={modelSelectOptions.length === 0}
                                disabledText="None"
                                label="Models"
                            />
                            <MultiSelect
                                options={keySelectOptions}
                                selected={filters.selectedKeys}
                                onChange={(v) =>
                                    setFilters((f) => ({
                                        ...f,
                                        selectedKeys: v,
                                    }))
                                }
                                placeholder="All"
                                disabled={usedKeys.length === 0}
                                disabledText="None"
                                align="end"
                                label="API Keys"
                            />
                        </div>

                        {/* Chart */}
                        <div className="relative bg-white rounded-xl p-4 border border-violet-200 mb-4">
                            <Chart
                                data={chartData}
                                metric={filters.metric}
                                showModelBreakdown={showModelBreakdown}
                            />
                        </div>

                        {/* Stats Row */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 p-3 bg-white/50 rounded-xl border border-violet-200">
                            <div className="flex-1 flex flex-col gap-1 sm:grid sm:grid-cols-3 sm:gap-4">
                                <Stat
                                    label="Requests"
                                    value={stats.totalRequests.toLocaleString()}
                                />
                                <Stat
                                    label="Pollen"
                                    value={stats.totalPollen.toFixed(2)}
                                />
                                <Stat
                                    label="Tokens"
                                    value={formatTokens(stats.totalTokens)}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (filteredData.length === 0) return;
                                    const headers = [
                                        "date",
                                        "event_type",
                                        "model",
                                        "requests",
                                        "cost_usd",
                                        "input_tokens",
                                        "output_tokens",
                                    ];
                                    const rows = filteredData.map(
                                        (r: DailyUsageRecord) =>
                                            [
                                                r.date,
                                                r.event_type || "",
                                                r.model || "",
                                                r.requests || 0,
                                                r.cost_usd || 0,
                                                r.input_tokens || 0,
                                                r.output_tokens || 0,
                                            ].join(","),
                                    );
                                    const csv = [
                                        headers.join(","),
                                        ...rows,
                                    ].join("\n");
                                    const blob = new Blob([csv], {
                                        type: "text/csv",
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `usage-${filters.timeRange}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-100 hover:bg-violet-200 transition-colors border border-violet-300 text-violet-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={filteredData.length === 0}
                                title={
                                    filteredData.length === 0
                                        ? "No data to download"
                                        : `Download CSV (${filteredData.length} rows)`
                                }
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <title>Download CSV</title>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                CSV
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default UsageGraph;
