import {
    InlineLink,
    LoadingStatus,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import type { FC } from "react";
import { LoadError, SectionContent } from "../layout/dashboard-loading.tsx";
import {
    ActivityEmptyState,
    ActivityFilter,
    ActivityKeyFilter,
    CsvDownloadButton,
    clearActivitySelectionOnEscape,
    downloadFile,
    PollenUsageBadges,
} from "./activity-helpers";
import { type ActivityPeriod, toggleActivityBucket } from "./activity-period";
import { ActivityToolbar } from "./activity-toolbar";
import { Chart } from "./chart";
import type { FilterState, Metric } from "./types";
import { useUsageData } from "./use-usage-data";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

type UsageSectionProps = {
    period: ActivityPeriod;
    onPeriodChange: (period: ActivityPeriod) => void;
    metric: Metric;
    selectedKeyIds: string[];
    selectedModels: string[];
    onMetricChange: (metric: Metric) => void;
    onSelectedKeyIdsChange: (keyIds: string[]) => void;
    onSelectedModelsChange: (models: string[]) => void;
};

export const UsageSection: FC<UsageSectionProps> = ({
    period,
    onPeriodChange,
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
        refreshing,
        error,
        fetchUsage,
        usedModels,
        usedApiKeys,
        chartData,
        hasData,
        stats,
        hasPeriodData,
    } = useUsageData(filters);

    const keySelectOptions = usedApiKeys.map((k) => ({
        value: k.id,
        label: k.label,
    }));
    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));
    const downloadDisabled = loading || refreshing || !hasPeriodData;
    const downloadDisabledReason =
        loading || refreshing
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
        downloadFile(`/api/account/usage?${params.toString()}`);
    }

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Handles Escape from keyboard-operable controls within this activity card.
        <div
            className="@container flex min-w-0 flex-col gap-4"
            onKeyDown={(event) =>
                clearActivitySelectionOnEscape(event, () =>
                    onPeriodChange({ ...period, bucket: undefined }),
                )
            }
        >
            <ActivityToolbar
                label="Usage"
                period={period}
                onPeriodChange={onPeriodChange}
                metric={metric}
                onMetricChange={onMetricChange}
                download={
                    <CsvDownloadButton
                        disabled={downloadDisabled}
                        disabledReason={downloadDisabledReason}
                        onClick={downloadDetailedUsage}
                    />
                }
            >
                {hasPeriodData && (
                    <>
                        <ActivityKeyFilter
                            label="Keys"
                            missingLabel="Unavailable key"
                            options={keySelectOptions}
                            selected={selectedKeyIds}
                            onChange={onSelectedKeyIdsChange}
                            emptyMessage="No API key usage in this period"
                        />
                        <ActivityFilter
                            label="Models"
                            options={modelSelectOptions}
                            selected={selectedModels}
                            onChange={onSelectedModelsChange}
                            emptyMessage="No model usage in this period"
                        />
                    </>
                )}
            </ActivityToolbar>

            <UsageChartView
                loading={loading}
                refreshing={refreshing}
                error={error}
                fetchUsage={fetchUsage}
                chartData={chartData}
                metric={metric}
                hasData={hasData}
                stats={stats}
                period={period}
                onPeriodChange={onPeriodChange}
            />
        </div>
    );
};

type UsageChartViewProps = Pick<
    ReturnType<typeof useUsageData>,
    | "loading"
    | "refreshing"
    | "error"
    | "fetchUsage"
    | "chartData"
    | "stats"
    | "hasData"
> & {
    metric: Metric;
    period: ActivityPeriod;
    onPeriodChange: (period: ActivityPeriod) => void;
};

const UsageChartView: FC<UsageChartViewProps> = ({
    loading,
    refreshing,
    error,
    fetchUsage,
    chartData,
    metric,
    hasData,
    stats,
    period,
    onPeriodChange,
}) => {
    return (
        <>
            <SectionContent loading={loading} label="Loading usage…">
                {refreshing && <LoadingStatus>Updating usage…</LoadingStatus>}
                {error && !loading && (
                    <LoadError onRetry={() => fetchUsage()}>{error}</LoadError>
                )}
                {!loading && hasData && (
                    <Chart
                        key={`${period.granularity}:${period.period}`}
                        period={period}
                        label="Usage"
                        onSelect={(point) =>
                            onPeriodChange(
                                toggleActivityBucket(period, point.timestamp),
                            )
                        }
                        data={chartData}
                        metric={metric}
                    />
                )}
                {!loading && !error && !hasData && <UsageEmptyState />}
            </SectionContent>

            {!loading && hasData && (
                <ModelBreakdownTable stats={stats} metric={metric} />
            )}
        </>
    );
};

const UsageEmptyState: FC = () => (
    <ActivityEmptyState>
        No usage in this period. Once you start using the API, your deductions
        will appear here.{" "}
        <InlineLink href="/keys">Create an API key</InlineLink>.
    </ActivityEmptyState>
);

type ModelBreakdownTableProps = {
    metric: Metric;
    stats: ReturnType<typeof useUsageData>["stats"];
};

const ModelBreakdownTable: FC<ModelBreakdownTableProps> = ({
    stats,
    metric,
}) => {
    const total = metric === "pollen" ? stats.totalPollen : stats.totalRequests;
    return (
        <div className="min-w-0 max-w-full overflow-x-auto">
            <Table
                aria-label="Usage by model"
                className="min-w-[340px] [&_tr:hover]:bg-transparent"
            >
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            scope="col"
                            className="px-2 py-1 font-normal"
                        >
                            Model
                        </TableHeaderCell>
                        <TableHeaderCell
                            scope="col"
                            align="right"
                            className="px-2 py-1 font-normal"
                        >
                            Share
                        </TableHeaderCell>
                        <TableHeaderCell
                            scope="col"
                            align="right"
                            className="px-2 py-1 font-normal"
                        >
                            {metric === "pollen" ? "Pollen" : "Requests"}
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody divider="neutral">
                    {stats.modelBreakdowns.map((model) => (
                        <TableRow key={model.model}>
                            <TableCell className="max-w-64 break-words text-xs">
                                {model.label}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className="text-xs"
                            >
                                {total > 0
                                    ? ((model[metric] / total) * 100).toFixed(1)
                                    : "0.0"}
                                %
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className="text-xs"
                            >
                                <PollenUsageBadges {...model} metric={metric} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <tfoot className="border-t border-divider font-semibold">
                    <TableRow>
                        <TableHeaderCell scope="row" colSpan={2}>
                            Total
                        </TableHeaderCell>
                        <TableCell align="right" numeric className="text-xs">
                            <PollenUsageBadges {...stats} metric={metric} />
                        </TableCell>
                    </TableRow>
                </tfoot>
            </Table>
        </div>
    );
};
