import {
    AudioIcon,
    Button,
    CardIcon,
    ChatIcon,
    Chip,
    DatabaseIcon,
    DownloadIcon,
    GlobeIcon,
    type IconProps,
    ImageIcon,
    InlineLink,
    MultiSelect,
    Section,
    SproutIcon,
    StatCard,
    Surface,
    TabButton,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { Chart } from "./chart";
import {
    MODALITY_META,
    MODEL_MODALITIES,
    type ModelModality,
} from "./constants";
import { formatActivityPollen } from "./format-activity-pollen";
import { TransactionHistory } from "./transaction-history";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

type UsageView = "chart" | "table";

type UsageSectionProps = {
    period: UsagePeriodSelection;
    apiKeys: Array<{ id: string; name: string }>;
};

function usageViewFromHash(hash: string): UsageView {
    return hash === "#activity-table" ? "table" : "chart";
}

const METRIC_LABELS: Record<Metric, string> = {
    requests: "Requests",
    pollen: "Pollen",
};

const METRIC_OPTIONS: Metric[] = ["pollen", "requests"];

const MetricTabs: FC<{
    value: Metric;
    onChange: (metric: Metric) => void;
}> = ({ value, onChange }) => (
    <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-theme-text-soft">Metric</span>
        <div className="flex flex-wrap justify-end gap-1.5">
            {METRIC_OPTIONS.map((metric) => (
                <TabButton
                    key={metric}
                    active={value === metric}
                    onClick={() => onChange(metric)}
                    size="sm"
                >
                    {METRIC_LABELS[metric]}
                </TabButton>
            ))}
        </div>
    </div>
);

export const UsageSection: FC<UsageSectionProps> = ({ period, apiKeys }) => {
    const [activeView, setActiveView] = useState<UsageView>(() =>
        usageViewFromHash(window.location.hash),
    );
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

    useEffect(() => {
        function syncViewFromHash(): void {
            setActiveView(usageViewFromHash(window.location.hash));
        }

        window.addEventListener("hashchange", syncViewFromHash);
        return () => window.removeEventListener("hashchange", syncViewFromHash);
    }, []);

    const { loading, error, fetchUsage, usedModels, chartData, stats } =
        useUsageData({
            ...filters,
            period,
        });

    useEffect(() => {
        const validModels = new Set(usedModels.map((m) => m.id));
        const pruned = filters.selectedModels.filter((id) =>
            validModels.has(id),
        );
        if (pruned.length !== filters.selectedModels.length) {
            setFilters((f) => ({ ...f, selectedModels: pruned }));
        }
    }, [usedModels, filters.selectedModels]);

    const keySelectOptions = apiKeys.map((k) => ({
        value: k.id,
        label: k.name,
    }));
    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));
    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;
    const hasUsageData = stats.totalRequests > 0;
    const downloadDisabled = loading || !hasUsageData;
    const downloadDisabledReason = loading
        ? "Loading usage data"
        : "No transactions to download for this selected period";

    function downloadDetailedUsage(): void {
        if (downloadDisabled) return;

        const params = new URLSearchParams({
            format: "csv",
            granularity: period.granularity,
            period: period.period,
            limit: DETAILED_USAGE_DOWNLOAD_LIMIT.toString(),
        });
        if (filters.selectedKeyIds.length > 0) {
            params.set("api_key_ids", filters.selectedKeyIds.join(","));
        }
        if (filters.selectedModels.length > 0) {
            params.set("models", filters.selectedModels.join(","));
        }

        const anchor = document.createElement("a");
        anchor.href = `/api/account/usage?${params.toString()}`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    const downloadButton = (
        <Button
            as="button"
            onClick={downloadDetailedUsage}
            disabled={downloadDisabled}
            className="flex items-center gap-1.5"
        >
            <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
            Download CSV
        </Button>
    );
    const downloadAction = downloadDisabled ? (
        <Tooltip
            triggerAs="span"
            content={downloadDisabledReason}
            align="center"
            className="inline-flex"
        >
            {downloadButton}
        </Tooltip>
    ) : (
        downloadButton
    );

    return (
        <Section title="API usage" framed action={downloadAction}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-1.5">
                        {(["chart", "table"] as UsageView[]).map((view) => (
                            <TabButton
                                key={view}
                                active={activeView === view}
                                onClick={() => setActiveView(view)}
                            >
                                {view === "chart" ? "Chart" : "Table"}
                            </TabButton>
                        ))}
                    </div>
                    <div className="flex flex-col items-stretch gap-2 [&>div]:justify-between">
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
                        {activeView === "chart" && (
                            <MetricTabs
                                value={filters.metric}
                                onChange={(metric) =>
                                    setFilters((f) => ({ ...f, metric }))
                                }
                            />
                        )}
                    </div>
                </div>

                {activeView === "chart" ? (
                    <UsageChartView
                        loading={loading}
                        error={error}
                        fetchUsage={fetchUsage}
                        chartData={chartData}
                        metric={filters.metric}
                        showModelBreakdown={showModelBreakdown}
                        stats={stats}
                    />
                ) : (
                    <Surface>
                        <TransactionHistory
                            apiKeys={apiKeys}
                            period={period}
                            selectedKeyIds={filters.selectedKeyIds}
                            selectedModels={filters.selectedModels}
                        />
                    </Surface>
                )}
            </div>
        </Section>
    );
};

type UsageChartViewProps = Pick<
    ReturnType<typeof useUsageData>,
    "loading" | "error" | "fetchUsage" | "chartData" | "stats"
> & {
    metric: Metric;
    showModelBreakdown: boolean;
};

const UsageChartView: FC<UsageChartViewProps> = ({
    loading,
    error,
    fetchUsage,
    chartData,
    metric,
    showModelBreakdown,
    stats,
}) => {
    const hasUsage = stats.totalRequests > 0;

    return (
        <>
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
                {!loading && !error && hasUsage && (
                    <Chart
                        data={chartData}
                        metric={metric}
                        showModelBreakdown={showModelBreakdown}
                    />
                )}
                {!loading && !error && !hasUsage && <UsageEmptyState />}
            </Surface>

            {!loading && !error && hasUsage && (
                <div className="grid gap-4 sm:grid-cols-3">
                    <Surface>
                        <StatCard
                            label="Pollen spent"
                            value={formatActivityPollen(stats.totalPollen)}
                            detail={
                                <div className="flex flex-wrap items-center gap-2">
                                    <PaidChip
                                        size="lg"
                                        className="font-semibold"
                                    >
                                        <CardIcon className="h-4 w-4" />
                                        {formatActivityPollen(stats.paidPollen)}
                                    </PaidChip>
                                    <TierChip
                                        size="lg"
                                        className="font-semibold"
                                    >
                                        <SproutIcon className="h-4 w-4" />
                                        {formatActivityPollen(stats.tierPollen)}
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
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span className="tabular-nums">
                                                {stats.topModel.requests.toLocaleString()}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                {stats.topModel.requests === 1
                                                    ? "req"
                                                    : "reqs"}
                                            </span>
                                        </Chip>
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span className="tabular-nums">
                                                {formatActivityPollen(
                                                    stats.topModel.pollen,
                                                )}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                pollen
                                            </span>
                                        </Chip>
                                    </div>
                                ) : (
                                    "No model usage yet"
                                )
                            }
                        />
                    </Surface>
                </div>
            )}
        </>
    );
};

const UsageEmptyState: FC = () => (
    <p className="text-sm text-ink-600">
        No transactions in this selected period. Once you start using the API,
        your deductions will appear here.{" "}
        <InlineLink href="#keys" showIcon={false}>
            Create an API key
        </InlineLink>
        .
    </p>
);

const MODALITY_ICON: Record<ModelModality, FC<IconProps>> = {
    text: ChatIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
    embedding: DatabaseIcon,
    realtime: GlobeIcon,
};

const ModalityPills: FC<{
    breakdown: Record<ModelModality, number>;
}> = ({ breakdown }) => {
    const entries = MODEL_MODALITIES.map((modality) => ({
        modality,
        count: breakdown[modality],
    })).filter(({ count }) => count > 0);
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
