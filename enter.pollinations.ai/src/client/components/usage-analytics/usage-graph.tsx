import type { FC } from "react";
import { useEffect, useState } from "react";
import type { TierStatus } from "../../../tier-config";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { Chart } from "./chart";
import { FilterButton } from "./filter-button";
import { MultiSelect } from "./multi-select";
import type { FilterState, Metric, TimeRange } from "./types";
import { useUsageData } from "./use-usage-data";

const TIER_EMOJIS: Record<TierStatus, string> = {
    none: "🦠",
    spore: "🦠",
    seed: "🌱",
    flower: "🌸",
    nectar: "🍯",
    router: "🔌",
};

export const UsageGraph: FC<{ tier?: TierStatus }> = ({ tier }) => {
    const [filters, setFilters] = useState<FilterState>({
        timeRange: "7d",
        metric: "pollen",
        selectedKeys: [],
        selectedModels: [],
    });

    const {
        loading,
        error,
        fetchUsage,
        usedModels,
        usedKeys,
        chartData,
        stats,
    } = useUsageData(filters);

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

    // On mobile, if "all" (90 days) is selected, switch to 30d
    useEffect(() => {
        const handleResize = () => {
            const isMobile = window.innerWidth < 640; // sm breakpoint
            if (isMobile && filters.timeRange === "all") {
                setFilters((f) => ({ ...f, timeRange: "30d" }));
            }
        };
        handleResize(); // Check on mount
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [filters.timeRange]);

    return (
        <div className="flex flex-col gap-2">
            <Panel color="violet">
                {loading && (
                    <div className="flex items-center justify-center h-[180px]">
                        <p className="text-sm text-gray-400 animate-[pulse_2s_ease-in-out_infinite]">
                            Fetching usage data…
                        </p>
                    </div>
                )}
                {error && !loading && (
                    <Card
                        color="red"
                        bg="bg-red-50"
                        className="flex items-center justify-center h-[180px] border-dashed"
                    >
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
                    </Card>
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
                                            className={
                                                t === "all"
                                                    ? "hidden sm:inline-flex"
                                                    : ""
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
                            </div>
                            <div className="flex gap-1.5 items-center">
                                <span className="text-xs font-medium text-gray-500 mr-1">
                                    Type
                                </span>
                                {(["requests", "pollen"] as Metric[]).map(
                                    (m) => (
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
                                                ? "Request"
                                                : "Pollen"}
                                        </FilterButton>
                                    ),
                                )}
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
                        <Card
                            color="violet"
                            bg="bg-white"
                            className="relative mb-4"
                        >
                            <Chart
                                data={chartData}
                                metric={filters.metric}
                                showModelBreakdown={showModelBreakdown}
                            />
                        </Card>

                        {/* Stats */}
                        <div className="space-y-1">
                            <div>
                                <span className="text-[10px] uppercase tracking-wide text-pink-400 font-bold">
                                    Requests
                                </span>
                                <span className="text-lg font-bold text-green-950 tabular-nums ml-2">
                                    {stats.totalRequests.toLocaleString()}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] uppercase tracking-wide text-pink-400 font-bold">
                                    Pollen
                                </span>
                                <span className="text-lg font-bold text-green-950 tabular-nums ml-2">
                                    {stats.totalPollen.toFixed(2)}
                                </span>
                                <span className="text-xs text-gray-400 ml-1">
                                    ({TIER_EMOJIS[tier || "spore"]}{" "}
                                    {stats.tierPollen.toFixed(2)} + 💎{" "}
                                    {stats.paidPollen.toFixed(2)})
                                </span>
                            </div>
                        </div>

                        {/* Info */}
                        <p className="text-[10px] text-gray-400 mt-4">
                            Data refreshes every hour. Times shown in UTC.
                        </p>
                    </>
                )}
            </Panel>
        </div>
    );
};

export default UsageGraph;
