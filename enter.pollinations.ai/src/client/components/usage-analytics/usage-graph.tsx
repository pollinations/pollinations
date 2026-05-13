import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { PAID_COLOR, TIER_COLOR } from "@/client/lib/balance-colors.ts";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import type { ThemeName } from "../layout/dashboard-theme.ts";
import { Chip } from "../ui/chip.tsx";
import { TabButton } from "../ui/tab-button.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { Chart } from "./chart";
import { MODALITY_META, type ModelModality } from "./constants";
import { MultiSelect } from "./multi-select";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

type UsageGraphProps = {
    period: UsagePeriodSelection;
    apiKeys: Array<{ id: string; name: string }>;
    action?: ReactNode;
    theme: ThemeName;
};

export const UsageGraph: FC<UsageGraphProps> = ({
    period,
    apiKeys,
    action,
    theme,
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
    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <DashboardSection title="Usage" theme={theme} framed action={action}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-stretch [&>button]:rounded-none [&>button]:border-l-0 [&>button:first-child]:rounded-l-full [&>button:first-child]:border-l [&>button:last-child]:rounded-r-full">
                        {(["requests", "pollen"] as Metric[]).map((m) => (
                            <TabButton
                                key={m}
                                active={filters.metric === m}
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        metric: m,
                                    }))
                                }
                            >
                                {m === "requests" ? "Request" : "Pollen"}
                            </TabButton>
                        ))}
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
                            theme={theme}
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
                            theme={theme}
                        />
                    </div>
                </div>

                <div className="border-t pt-4 border-theme-border">
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
                            paidBarColor={PAID_COLOR}
                            tierBarColor={TIER_COLOR}
                        />
                    )}
                </div>

                {!loading && !error && (
                    <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:gap-0 sm:divide-x border-theme-border divide-theme-border">
                        <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                            <UsageStatCard
                                label="Pollen spent"
                                value={formatPollen(stats.totalPollen)}
                                detail={
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Chip
                                            intent="paid"
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            💳 {formatPollen(stats.paidPollen)}
                                        </Chip>
                                        <Chip
                                            intent="tier"
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            🌱 {formatPollen(stats.tierPollen)}
                                        </Chip>
                                    </div>
                                }
                                theme={theme}
                            />
                        </div>
                        <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                            <UsageStatCard
                                label="Requests"
                                value={stats.totalRequests.toLocaleString()}
                                detail={
                                    <ModalityPills
                                        breakdown={stats.requestsByModality}
                                        theme={theme}
                                    />
                                }
                                theme={theme}
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
                                            <Tooltip
                                                content={`${stats.topModel.requests.toLocaleString()} request${stats.topModel.requests === 1 ? "" : "s"}`}
                                                displayContents
                                            >
                                                <Chip
                                                    size="lg"
                                                    className="font-semibold"
                                                >
                                                    <span className="tabular-nums">
                                                        {stats.topModel.requests.toLocaleString()}
                                                    </span>
                                                    <span className="font-medium opacity-70">
                                                        {stats.topModel
                                                            .requests === 1
                                                            ? "req"
                                                            : "reqs"}
                                                    </span>
                                                </Chip>
                                            </Tooltip>
                                            <Tooltip
                                                content={`${formatPollen(stats.topModel.pollen)} pollen`}
                                                displayContents
                                            >
                                                <Chip
                                                    size="lg"
                                                    className="font-semibold"
                                                >
                                                    <span className="tabular-nums">
                                                        {formatPollen(
                                                            stats.topModel
                                                                .pollen,
                                                        )}
                                                    </span>
                                                    <span className="font-medium opacity-70">
                                                        pollen
                                                    </span>
                                                </Chip>
                                            </Tooltip>
                                        </div>
                                    ) : (
                                        "No model usage yet"
                                    )
                                }
                                theme={theme}
                            />
                        </div>
                    </div>
                )}
            </div>
        </DashboardSection>
    );
};

const UsageStatCard: FC<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    theme: ThemeName;
}> = ({ label, value, detail, theme }) => (
    <div data-theme={theme} className="text-sm">
        <div className="text-micro uppercase tracking-wide font-bold text-theme-text-strong">
            {label}
        </div>
        <div className="mt-1 min-h-8 break-words text-2xl font-bold leading-tight tabular-nums text-theme-text-strong">
            {value}
        </div>
        {detail && (
            <div className="mt-2 text-xs text-theme-text-soft">{detail}</div>
        )}
    </div>
);

const ModalityPills: FC<{
    breakdown: Record<ModelModality, number>;
    theme: ThemeName;
}> = ({ breakdown, theme }) => {
    const entries = (Object.keys(MODALITY_META) as ModelModality[])
        .map((modality) => ({ modality, count: breakdown[modality] }))
        .filter(({ count }) => count > 0);
    if (entries.length === 0) return null;
    return (
        <div data-theme={theme} className="flex flex-wrap items-center gap-2">
            {entries.map(({ modality, count }) => {
                const { emoji, label } = MODALITY_META[modality];
                return (
                    <Tooltip
                        key={modality}
                        content={`${count.toLocaleString()} ${label} request${count === 1 ? "" : "s"}`}
                        displayContents
                    >
                        <Chip
                            theme={theme}
                            size="lg"
                            className="font-semibold text-theme-text-base"
                        >
                            <span aria-hidden="true">{emoji}</span>
                            <span className="tabular-nums">
                                {count.toLocaleString()}
                            </span>
                        </Chip>
                    </Tooltip>
                );
            })}
        </div>
    );
};

export default UsageGraph;
