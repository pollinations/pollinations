import type { TierStatus } from "@shared/tier-config.ts";
import { getTierColor, TIER_EMOJIS } from "@shared/tier-config.ts";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { pillColors } from "../layout/dashboard-theme.ts";
import { TabButton } from "../ui/tab-button.tsx";
import { Chart } from "./chart";
import { MODALITY_META, type ModelModality } from "./constants";
import { MultiSelect } from "./multi-select";
import { PeriodPicker } from "./period-picker.tsx";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

type UsageGraphProps = {
    tier?: TierStatus;
    period: UsagePeriodSelection;
    onPeriodChange: (period: UsagePeriodSelection) => void;
    apiKeys: Array<{ id: string; name: string }>;
    action?: ReactNode;
};

export const UsageGraph: FC<UsageGraphProps> = ({
    tier,
    period,
    onPeriodChange,
    apiKeys,
    action,
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

    const tierPill =
        pillColors[
            getTierColor(
                (tier || "spore") as TierStatus,
            ) as keyof typeof pillColors
        ] ?? pillColors.blue;

    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <div className="flex flex-col gap-6">
            <DashboardSection
                title="Activity"
                theme="pink"
                framed
                action={action}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex flex-col gap-4">
                            <PeriodPicker
                                value={period}
                                onChange={onPeriodChange}
                            />
                            <div className="flex items-stretch [&>button]:rounded-none [&>button]:border-l-0 [&>button:first-child]:rounded-l-full [&>button:first-child]:border-l [&>button:last-child]:rounded-r-full">
                                {(["requests", "pollen"] as Metric[]).map(
                                    (m) => (
                                        <TabButton
                                            key={m}
                                            theme="pink"
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
                                        </TabButton>
                                    ),
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 [&>div]:justify-between [&_button]:min-w-[160px]">
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
                                align="end"
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
                    </div>

                    <div className="border-t border-pink-300/70 pt-4">
                        {loading && (
                            <div className="flex items-center justify-center h-[180px]">
                                <p className="text-sm text-gray-400 animate-[pulse_2s_ease-in-out_infinite]">
                                    Fetching usage data…
                                </p>
                            </div>
                        )}
                        {error && !loading && (
                            <div className="flex items-center justify-center h-[180px]">
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
                            <Chart
                                data={chartData}
                                metric={filters.metric}
                                showModelBreakdown={showModelBreakdown}
                                tier={tier}
                            />
                        )}
                    </div>

                    {!loading && !error && (
                        <div className="flex flex-col gap-4 border-t border-pink-300/70 pt-4 sm:flex-row sm:gap-0 sm:divide-x sm:divide-pink-300/70">
                            <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                                <UsageStatCard
                                    label="Requests"
                                    value={stats.totalRequests.toLocaleString()}
                                    detail={
                                        <ModalityPills
                                            breakdown={stats.requestsByModality}
                                        />
                                    }
                                />
                            </div>
                            <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                                <UsageStatCard
                                    label="Pollen spent"
                                    value={formatPollen(stats.totalPollen)}
                                    detail={
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tierPill.bg} ${tierPill.text}`}
                                            >
                                                {tierEmoji}{" "}
                                                {formatPollen(stats.tierPollen)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">
                                                🪷{" "}
                                                {formatPollen(stats.paidPollen)}
                                            </span>
                                        </div>
                                    }
                                />
                            </div>
                            <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                                <UsageStatCard
                                    label="Top model"
                                    value={
                                        <span className="text-xl leading-tight">
                                            {stats.topModel?.label || "None"}
                                        </span>
                                    }
                                    detail={
                                        stats.topModel ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    title={`${stats.topModel.requests.toLocaleString()} request${stats.topModel.requests === 1 ? "" : "s"}`}
                                                    className="inline-flex items-center gap-1 rounded-full bg-pink-200 px-2.5 py-1 text-xs font-semibold text-pink-900"
                                                >
                                                    <span aria-hidden="true">
                                                        🔁
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {stats.topModel.requests.toLocaleString()}
                                                    </span>
                                                </span>
                                                <span
                                                    title={`${formatPollen(stats.topModel.pollen)} pollen`}
                                                    className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900"
                                                >
                                                    <span aria-hidden="true">
                                                        🪷
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {formatPollen(
                                                            stats.topModel
                                                                .pollen,
                                                        )}
                                                    </span>
                                                </span>
                                            </div>
                                        ) : (
                                            "No model usage yet"
                                        )
                                    }
                                />
                            </div>
                        </div>
                    )}
                </div>
            </DashboardSection>
            {!loading && !error && (
                <p className="text-[10px] text-gray-400">
                    Data refreshes every hour. Times shown in UTC.
                </p>
            )}
        </div>
    );
};

const formatPollen = (value: number): string => {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.01) return value.toPrecision(2);
    return value.toFixed(2);
};

const UsageStatCard: FC<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}> = ({ label, value, detail }) => (
    <div className="text-sm">
        <div className="text-[10px] uppercase tracking-wide text-pink-600 font-bold">
            {label}
        </div>
        <div className="mt-1 min-h-8 break-words text-2xl font-bold leading-tight text-pink-950 tabular-nums">
            {value}
        </div>
        {detail && (
            <div className="mt-2 text-xs text-pink-800/75">{detail}</div>
        )}
    </div>
);

const ModalityPills: FC<{ breakdown: Record<ModelModality, number> }> = ({
    breakdown,
}) => {
    const entries = (Object.keys(MODALITY_META) as ModelModality[])
        .map((modality) => ({ modality, count: breakdown[modality] }))
        .filter(({ count }) => count > 0);
    if (entries.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            {entries.map(({ modality, count }) => {
                const { emoji, label } = MODALITY_META[modality];
                return (
                    <span
                        key={modality}
                        title={`${count.toLocaleString()} ${label} request${count === 1 ? "" : "s"}`}
                        className="inline-flex items-center gap-1 rounded-full bg-pink-200 px-2.5 py-1 text-xs font-semibold text-pink-900"
                    >
                        <span aria-hidden="true">{emoji}</span>
                        <span className="tabular-nums">
                            {count.toLocaleString()}
                        </span>
                    </span>
                );
            })}
        </div>
    );
};

export default UsageGraph;
