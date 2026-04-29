import type { TierStatus } from "@shared/tier-config.ts";
import { getTierColor, TIER_EMOJIS } from "@shared/tier-config.ts";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { Chart } from "./chart";
import { FilterButton } from "./filter-button";
import { MultiSelect } from "./multi-select";
import { PeriodPicker } from "./period-picker.tsx";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

const TIER_PILL_CLASSES = {
    gray: "bg-gray-200 text-gray-900",
    blue: "bg-blue-200 text-blue-900",
    green: "bg-green-200 text-green-900",
    pink: "bg-pink-200 text-pink-900",
    amber: "bg-amber-200 text-amber-900",
    orange: "bg-orange-300 text-orange-950",
    violet: "bg-violet-200 text-violet-950",
} as const;

type UsageGraphProps = {
    tier?: TierStatus;
    period: UsagePeriodSelection;
    onPeriodChange: (period: UsagePeriodSelection) => void;
    apiKeys: Array<{ id: string; name: string }>;
};

export const UsageGraph: FC<UsageGraphProps> = ({
    tier,
    period,
    onPeriodChange,
    apiKeys,
}) => {
    const [filters, setFilters] = useState<Omit<FilterState, "period">>({
        metric: "pollen",
        selectedKeyIds: [],
        selectedModels: [],
    });

    useEffect(() => {
        const validIds = new Set(apiKeys.map((k) => k.id));
        const pruned = filters.selectedKeyIds.filter((id) => validIds.has(id));
        if (pruned.length !== filters.selectedKeyIds.length) {
            setFilters((f) => ({ ...f, selectedKeyIds: pruned }));
        }
    }, [apiKeys, filters.selectedKeyIds]);

    const keySelectOptions = apiKeys.map((k) => ({
        value: k.id,
        label: k.name,
    }));

    const { loading, error, fetchUsage, usedModels, chartData, stats } =
        useUsageData({
            ...filters,
            period,
        });

    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));
    const tierEmoji =
        tier && tier !== "none" ? TIER_EMOJIS[tier] : TIER_EMOJIS.spore;

    const tierColor =
        TIER_PILL_CLASSES[
            getTierColor(
                (tier || "spore") as TierStatus,
            ) as keyof typeof TIER_PILL_CLASSES
        ] || TIER_PILL_CLASSES.blue;

    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <div className="flex flex-col gap-2">
            <Panel color="amber">
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
                        {/* Filters Row 1: Period + Metric */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <PeriodPicker
                                value={period}
                                onChange={onPeriodChange}
                            />
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
                                selected={filters.selectedKeyIds}
                                onChange={(v) =>
                                    setFilters((f) => ({
                                        ...f,
                                        selectedKeyIds: v,
                                    }))
                                }
                                placeholder="All"
                                disabled={keySelectOptions.length === 0}
                                disabledText="None"
                                align="end"
                                label="API Keys"
                            />
                        </div>

                        {/* Chart */}
                        <Card
                            color="amber"
                            bg="bg-white"
                            className="relative mb-4"
                        >
                            <Chart
                                data={chartData}
                                metric={filters.metric}
                                showModelBreakdown={showModelBreakdown}
                                tier={tier}
                            />
                        </Card>

                        {/* Stats */}
                        <div className="space-y-1">
                            <div>
                                <span className="text-[10px] uppercase tracking-wide text-amber-500 font-bold">
                                    Requests
                                </span>
                                <span className="ml-2 text-lg font-bold text-amber-950 tabular-nums">
                                    {stats.totalRequests.toLocaleString()}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] uppercase tracking-wide text-amber-500 font-bold">
                                    Pollen
                                </span>
                                <span className="ml-2 text-lg font-bold text-amber-950 tabular-nums">
                                    {stats.totalPollen.toFixed(2)}
                                </span>
                                <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tierColor}`}
                                    >
                                        {tierEmoji}{" "}
                                        {stats.tierPollen.toFixed(2)}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">
                                        🪷 {stats.paidPollen.toFixed(2)}
                                    </span>
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
