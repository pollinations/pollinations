import {
    AudioIcon,
    CardIcon,
    ChatIcon,
    Chip,
    type IconProps,
    ImageIcon,
    MultiSelect,
    Section,
    SproutIcon,
    StatCard,
    Surface,
    TabButton,
    Tooltip,
} from "@pollinations/ui";
import {
    formatPollen,
    PAID_BALANCE_CHART_COLOR,
    PaidChip,
    TIER_BALANCE_CHART_COLOR,
    TierChip,
} from "@pollinations/ui/wallet";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Chart } from "./chart";
import { MODALITY_META, type ModelModality } from "./constants";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

type UsageGraphProps = {
    period: UsagePeriodSelection;
    apiKeys: Array<{ id: string; name: string }>;
    action?: ReactNode;
};

export const UsageGraph: FC<UsageGraphProps> = ({
    period,
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
    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <Section title="Usage" framed action={action}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-1.5">
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
                                variant="soft"
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

                <Surface>
                    {loading && (
                        <div className="flex items-center justify-center h-[180px]">
                            <p className="text-sm text-theme-text-muted animate-[pulse_2s_ease-in-out_infinite]">
                                Fetching usage data…
                            </p>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="flex items-center justify-center h-[180px]">
                            <div className="text-center">
                                <p className="text-sm text-intent-danger-text font-medium">
                                    {error}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => fetchUsage()}
                                    className="mt-2 text-xs text-intent-danger-text hover:text-intent-danger-text underline"
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
                            paidBarColor={PAID_BALANCE_CHART_COLOR}
                            tierBarColor={TIER_BALANCE_CHART_COLOR}
                        />
                    )}
                </Surface>

                {!loading && !error && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Surface>
                            <StatCard
                                label="Pollen spent"
                                value={formatPollen(stats.totalPollen)}
                                detail={
                                    <div className="flex flex-wrap items-center gap-2">
                                        <PaidChip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <CardIcon className="h-4 w-4" />
                                            {formatPollen(stats.paidPollen)}
                                        </PaidChip>
                                        <TierChip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <SproutIcon className="h-4 w-4" />
                                            {formatPollen(stats.tierPollen)}
                                        </TierChip>
                                    </div>
                                }
                            />
                        </Surface>
                        <Surface>
                            <StatCard
                                label="Requests"
                                value={stats.totalRequests.toLocaleString()}
                                detail={
                                    <ModalityPills
                                        breakdown={stats.requestsByModality}
                                    />
                                }
                            />
                        </Surface>
                        <Surface>
                            <StatCard
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
                            />
                        </Surface>
                    </div>
                )}
            </div>
        </Section>
    );
};

const MODALITY_ICON: Record<ModelModality, FC<IconProps>> = {
    text: ChatIcon,
    image: ImageIcon,
    audio: AudioIcon,
};

const ModalityPills: FC<{
    breakdown: Record<ModelModality, number>;
}> = ({ breakdown }) => {
    const entries = (Object.keys(MODALITY_META) as ModelModality[])
        .map((modality) => ({ modality, count: breakdown[modality] }))
        .filter(({ count }) => count > 0);
    if (entries.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            {entries.map(({ modality, count }) => {
                const { label } = MODALITY_META[modality];
                const Icon = MODALITY_ICON[modality];
                return (
                    <Tooltip
                        key={modality}
                        content={`${count.toLocaleString()} ${label} request${count === 1 ? "" : "s"}`}
                        displayContents
                    >
                        <Chip
                            size="lg"
                            className="font-semibold text-theme-text-base"
                        >
                            <Icon className="h-4 w-4" />
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
