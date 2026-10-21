import {
    InlineLink,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import type { FC } from "react";
import { accountClient } from "../../api.ts";
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
import {
    type ActivityPeriod,
    activityTimezone,
    toggleActivityBucket,
} from "./activity-period";
import { ActivityToolbar } from "./activity-toolbar";
import { Chart } from "./chart";
import type { FilterState, Metric, UsageGroupBy } from "./types";
import { useUsageData } from "./use-usage-data";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

type UsageSectionProps = {
    period: ActivityPeriod;
    onPeriodChange: (period: ActivityPeriod) => void;
    metric: Metric;
    groupBy: UsageGroupBy;
    onGroupByChange: (groupBy: UsageGroupBy) => void;
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
    groupBy,
    onGroupByChange,
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
    } = useUsageData(filters, groupBy);

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

        accountClient.usage
            .$get({
                query: {
                    format: "csv",
                    granularity: period.granularity,
                    period: period.period,
                    timezone: activityTimezone(),
                    limit: DETAILED_USAGE_DOWNLOAD_LIMIT.toString(),
                },
            })
            .then(downloadFile)
            .catch((error) => console.error("Usage download failed:", error));
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
                error={error}
                fetchUsage={fetchUsage}
                chartData={chartData}
                metric={metric}
                hasData={hasData}
                stats={stats}
                groupBy={groupBy}
                onGroupByChange={onGroupByChange}
                period={period}
                onPeriodChange={onPeriodChange}
            />
        </div>
    );
};

type UsageChartViewProps = Pick<
    ReturnType<typeof useUsageData>,
    "loading" | "error" | "fetchUsage" | "chartData" | "stats" | "hasData"
> & {
    metric: Metric;
    groupBy: UsageGroupBy;
    onGroupByChange: (groupBy: UsageGroupBy) => void;
    period: ActivityPeriod;
    onPeriodChange: (period: ActivityPeriod) => void;
};

const UsageChartView: FC<UsageChartViewProps> = ({
    loading,
    error,
    fetchUsage,
    chartData,
    metric,
    hasData,
    stats,
    groupBy,
    onGroupByChange,
    period,
    onPeriodChange,
}) => {
    return (
        <>
            <SectionContent loading={loading}>
                {error && (
                    <LoadError onRetry={() => fetchUsage()}>{error}</LoadError>
                )}
                {hasData && (
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
                {!error && !hasData && <UsageEmptyState />}
            </SectionContent>

            {!loading && hasData && (
                <UsageBreakdownTable
                    stats={stats}
                    metric={metric}
                    groupBy={groupBy}
                    onGroupByChange={onGroupByChange}
                />
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

type UsageBreakdownTableProps = {
    metric: Metric;
    groupBy: UsageGroupBy;
    onGroupByChange: (groupBy: UsageGroupBy) => void;
    stats: ReturnType<typeof useUsageData>["stats"];
};

const UsageBreakdownTable: FC<UsageBreakdownTableProps> = ({
    stats,
    metric,
    groupBy,
    onGroupByChange,
}) => {
    const total = metric === "pollen" ? stats.totalPollen : stats.totalRequests;
    return (
        <div className="min-w-0 max-w-full overflow-x-auto">
            <Table
                aria-label={`Usage by ${groupBy}`}
                className="min-w-[340px] [&_tr:hover]:bg-transparent"
            >
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            scope="col"
                            aria-label={groupBy === "model" ? "Model" : "Key"}
                            className="px-2 py-1 font-normal"
                        >
                            <fieldset
                                aria-label="Group usage by"
                                className="flex items-center gap-1"
                            >
                                {(["model", "key"] as const).map((group) => (
                                    <TabButton
                                        key={group}
                                        active={groupBy === group}
                                        onClick={() => onGroupByChange(group)}
                                        size="xs"
                                        className="min-h-8"
                                    >
                                        {group === "model" ? "Models" : "Keys"}
                                    </TabButton>
                                ))}
                            </fieldset>
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
                    {stats.breakdowns.map((row) => (
                        <TableRow key={row.id}>
                            <TableCell className="max-w-64 break-words text-xs">
                                {row.label}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className="text-xs"
                            >
                                {total > 0
                                    ? ((row[metric] / total) * 100).toFixed(1)
                                    : "0.0"}
                                %
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className="text-xs"
                            >
                                <PollenUsageBadges {...row} metric={metric} />
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
