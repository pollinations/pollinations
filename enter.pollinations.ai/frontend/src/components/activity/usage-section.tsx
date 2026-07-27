import {
    Button,
    CardIcon,
    DownloadIcon,
    InlineLink,
    MultiSelect,
    SproutIcon,
    StatCard,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
    UsageIcon,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useMemo } from "react";
import { Chart } from "./chart";
import { formatActivityPollen } from "./format-activity-pollen";
import { formatTokens } from "./format-tokens";
import { MetricTabs } from "./metric-tabs";
import type { FilterState, Metric, ModelBreakdown, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

type UsageSectionProps = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedKeyIds: string[];
    selectedModels: string[];
    onMetricChange: (metric: Metric) => void;
    onSelectedKeyIdsChange: (keyIds: string[]) => void;
    onSelectedModelsChange: (models: string[]) => void;
};

export const UsageSection: FC<UsageSectionProps> = ({
    period,
    metric,
    selectedKeyIds,
    selectedModels,
    onMetricChange,
    onSelectedKeyIdsChange,
    onSelectedModelsChange,
}) => {
    const filters: FilterState = {
        period,
        metric,
        selectedKeyIds,
        selectedModels,
    };
    const {
        loading,
        error,
        fetchUsage,
        usedModels,
        usedApiKeys,
        chartData,
        stats,
    } = useUsageData(filters);

    const effectiveKeyIds = useMemo(() => {
        const valid = new Set(usedApiKeys.map((k) => k.id));
        return filters.selectedKeyIds.filter((id) => valid.has(id));
    }, [usedApiKeys, filters.selectedKeyIds]);

    const effectiveModels = useMemo(() => {
        const valid = new Set(usedModels.map((m) => m.id));
        return filters.selectedModels.filter((id) => valid.has(id));
    }, [usedModels, filters.selectedModels]);

    const keySelectOptions = usedApiKeys.map((k) => ({
        value: k.id,
        label: k.label,
    }));
    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));
    const showModelBreakdown =
        effectiveModels.length === 0 || effectiveModels.length > 1;
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
        if (effectiveKeyIds.length > 0) {
            params.set("api_key_ids", effectiveKeyIds.join(","));
        }
        if (effectiveModels.length > 0) {
            params.set("models", effectiveModels.join(","));
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
            CSV
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
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 font-body text-base font-semibold text-theme-text-strong">
                    <UsageIcon className="h-4 w-4 shrink-0" />
                    Usage
                </div>
                {downloadAction}
            </div>
            <Surface className="flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-start gap-2">
                        <div className="flex w-full items-center gap-3">
                            <span className="w-20 shrink-0 text-xs font-medium text-theme-text-soft">
                                Keys
                            </span>
                            <div className="min-w-0 flex-1 max-w-60 [&_button]:w-full">
                                {keySelectOptions.length === 0 ? (
                                    <span className="inline-flex min-h-8 items-center text-xs text-theme-text-muted">
                                        No API key usage in this period
                                    </span>
                                ) : (
                                    <MultiSelect
                                        options={keySelectOptions}
                                        selected={selectedKeyIds}
                                        onChange={onSelectedKeyIdsChange}
                                        placeholder="All"
                                        align="start"
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex w-full items-center gap-3">
                            <span className="w-20 shrink-0 text-xs font-medium text-theme-text-soft">
                                Models
                            </span>
                            <div className="min-w-0 flex-1 max-w-60 [&_button]:w-full">
                                {modelSelectOptions.length === 0 ? (
                                    <span className="inline-flex min-h-8 items-center text-xs text-theme-text-muted">
                                        No model usage in this period
                                    </span>
                                ) : (
                                    <MultiSelect
                                        options={modelSelectOptions}
                                        selected={selectedModels}
                                        onChange={onSelectedModelsChange}
                                        placeholder="All"
                                        align="start"
                                    />
                                )}
                            </div>
                        </div>
                        <MetricTabs value={metric} onChange={onMetricChange} />
                    </div>

                    <UsageChartView
                        loading={loading}
                        error={error}
                        fetchUsage={fetchUsage}
                        chartData={chartData}
                        metric={metric}
                        showModelBreakdown={showModelBreakdown}
                        stats={stats}
                    />
                </div>
            </Surface>
        </div>
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
            <div className="min-h-[180px]">
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
            </div>

            {!loading && !error && hasUsage && (
                <>
                    <div className="grid gap-4 border-t border-divider pt-4 sm:grid-cols-2">
                        <StatCard
                            className="min-w-0"
                            label="Pollen spent"
                            value={formatActivityPollen(stats.totalPollen)}
                            detail={
                                <div className="flex flex-wrap items-center gap-2">
                                    <PaidChip size="lg" className="font-semibold">
                                        <CardIcon className="h-4 w-4" />
                                        {formatActivityPollen(stats.paidPollen)}
                                    </PaidChip>
                                    <TierChip size="lg" className="font-semibold">
                                        <SproutIcon className="h-4 w-4" />
                                        {formatActivityPollen(stats.tierPollen)}
                                    </TierChip>
                                </div>
                            }
                        />
                        <StatCard
                            className="min-w-0"
                            label="Requests"
                            value={stats.totalRequests.toLocaleString()}
                            detail={
                                stats.activeApiKeyCount === null ? null : (
                                    <span className="text-theme-text-soft">
                                        across {stats.activeApiKeyCount} API key
                                        {stats.activeApiKeyCount === 1 ? "" : "s"}
                                    </span>
                                )
                            }
                        />
                    </div>
                    {stats.modelBreakdowns.length > 0 && (
                        <ModelBreakdownTable
                            models={stats.modelBreakdowns}
                            totalPollen={stats.totalPollen}
                        />
                    )}
                </>
            )}
        </>
    );
};

const UsageEmptyState: FC = () => (
    <p className="text-sm text-ink-600">
        No transactions in this selected period. Once you start using the API,
        your deductions will appear here.{" "}
        <InlineLink href="/keys" showIcon={false}>
            Create an API key
        </InlineLink>
        .
    </p>
);

type ModelBreakdownTableProps = {
    models: ModelBreakdown[];
    totalPollen: number;
};

const TABLE_HEADER_CELL_CLASS = "px-2 py-1.5";
const TABLE_CELL_CLASS = "px-2 py-1.5 text-xs";

const ModelBreakdownTable: FC<ModelBreakdownTableProps> = ({
    models,
    totalPollen,
}) => {
    const pctOf = (pollen: number) =>
        totalPollen > 0 ? ((pollen / totalPollen) * 100).toFixed(1) : "0.0";

    return (
        <div className="border-t border-divider pt-4">
            <h4 className="mb-2 text-xs font-medium text-theme-text-soft">
                Per-model breakdown
            </h4>
            <div className="overflow-x-auto">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                Model
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                %
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden sm:table-cell`}
                            >
                                Quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden sm:table-cell`}
                            >
                                Paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                Reqs
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden md:table-cell`}
                            >
                                In
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden md:table-cell`}
                            >
                                Out
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden lg:table-cell`}
                            >
                                Audio
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={`${TABLE_HEADER_CELL_CLASS} hidden lg:table-cell`}
                            >
                                Video
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {models.map((m) => {
                            const inTokens =
                                (m.inputTextTokens ?? 0) +
                                (m.inputCachedTokens ?? 0) +
                                (m.inputImageTokens ?? 0);
                            const outTokens =
                                (m.outputTextTokens ?? 0) +
                                (m.outputReasoningTokens ?? 0) +
                                (m.outputImageTokens ?? 0);
                            const hasAudio =
                                (m.inputAudioTokens ?? 0) > 0 ||
                                (m.inputAudioSeconds ?? 0) > 0 ||
                                (m.outputAudioTokens ?? 0) > 0 ||
                                (m.outputAudioSeconds ?? 0) > 0;
                            const hasVideo = (m.outputVideoSeconds ?? 0) > 0;

                            return (
                                <TableRow key={m.model}>
                                    <TableCell
                                        className={`${TABLE_CELL_CLASS} max-w-[120px] truncate font-medium`}
                                        title={m.model}
                                    >
                                        {m.model}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={TABLE_CELL_CLASS}
                                    >
                                        {pctOf(m.pollen)}%
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={TABLE_CELL_CLASS}
                                    >
                                        {formatActivityPollen(m.pollen)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden sm:table-cell`}
                                    >
                                        {(m.tierPollen ?? 0) > 0
                                            ? formatActivityPollen(m.tierPollen ?? 0)
                                            : "—"}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden sm:table-cell`}
                                    >
                                        {(m.paidPollen ?? 0) > 0
                                            ? formatActivityPollen(m.paidPollen ?? 0)
                                            : "—"}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={TABLE_CELL_CLASS}
                                    >
                                        {m.requests.toLocaleString()}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden md:table-cell`}
                                    >
                                        {formatTokens(inTokens)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden md:table-cell`}
                                    >
                                        {formatTokens(outTokens)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden lg:table-cell`}
                                    >
                                        {hasAudio
                                            ? `${formatTokens((m.inputAudioTokens ?? 0) + (m.outputAudioTokens ?? 0))} / ${((m.inputAudioSeconds ?? 0) + (m.outputAudioSeconds ?? 0)).toFixed(1)}s`
                                            : "—"}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={`${TABLE_CELL_CLASS} hidden lg:table-cell`}
                                    >
                                        {hasVideo
                                            ? `${(m.outputVideoSeconds ?? 0).toFixed(1)}s`
                                            : "—"}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            {/* Mobile card fallback */}
            <div className="mt-2 flex flex-col gap-2 sm:hidden">
                {models.map((m) => {
                    const inTokens =
                        (m.inputTextTokens ?? 0) +
                        (m.inputCachedTokens ?? 0) +
                        (m.inputImageTokens ?? 0);
                    const outTokens =
                        (m.outputTextTokens ?? 0) +
                        (m.outputReasoningTokens ?? 0) +
                        (m.outputImageTokens ?? 0);

                    return (
                        <div
                            key={m.model}
                            className="rounded-lg border border-theme-border/40 bg-theme-bg-subtle p-3"
                        >
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs font-medium truncate max-w-[200px]">
                                    {m.model}
                                </span>
                                <span className="text-xs text-theme-text-muted">
                                    {pctOf(m.pollen)}%
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-theme-text-muted">
                                    Pollen
                                </span>
                                <span className="text-right tabular-nums">
                                    {formatActivityPollen(m.pollen)}
                                </span>
                                <span className="text-theme-text-muted">
                                    Requests
                                </span>
                                <span className="text-right tabular-nums">
                                    {m.requests.toLocaleString()}
                                </span>
                                <span className="text-theme-text-muted">
                                    In / Out
                                </span>
                                <span className="text-right tabular-nums">
                                    {formatTokens(inTokens)} / {formatTokens(outTokens)}
                                </span>
                                {(m.tierPollen ?? 0) > 0 && (
                                    <>
                                        <span className="text-theme-text-muted">
                                            Quest
                                        </span>
                                        <span className="text-right tabular-nums">
                                            {formatActivityPollen(m.tierPollen ?? 0)}
                                        </span>
                                    </>
                                )}
                                {(m.paidPollen ?? 0) > 0 && (
                                    <>
                                        <span className="text-theme-text-muted">
                                            Paid
                                        </span>
                                        <span className="text-right tabular-nums">
                                            {formatActivityPollen(m.paidPollen ?? 0)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
