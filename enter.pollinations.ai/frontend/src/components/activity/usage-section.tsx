import {
    InlineLink,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import type { FC } from "react";
import { downloadActivityCsv } from "./activity-csv";
import {
    ActivityFilter,
    CsvDownloadButton,
    downloadFile,
    PollenUsageBadges,
} from "./activity-helpers";
import { type ActivityPeriod, toggleActivityBucket } from "./activity-period";
import { ActivityToolbar } from "./activity-toolbar";
import { Chart } from "./chart";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
import { useUsageData } from "./use-usage-data";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

type UsageSectionProps = {
    period: UsagePeriodSelection;
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
        error,
        fetchUsage,
        usedModels,
        usedApiKeys,
        chartData,
        hasData,
        stats,
        exportRows,
    } = useUsageData(filters);

    const effectiveKeyIds = selectedKeyIds;
    const effectiveModels = selectedModels;

    const keySelectOptions = usedApiKeys.map((k) => ({
        value: k.id,
        label: k.label,
    }));
    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));
    const hasUsageData = stats.totalRequests > 0;
    const downloadDisabled = loading || !hasUsageData;
    const downloadDisabledReason = loading
        ? "Loading usage data"
        : "No transactions to download for this selected period";

    function downloadDetailedUsage(): void {
        if (downloadDisabled) return;

        if (period.bucket !== undefined) {
            downloadActivityCsv(
                `usage-summary-${period.period}-${period.bucket}`,
                [
                    "date",
                    "api_key",
                    "model",
                    "meter_source",
                    "requests",
                    "cost_usd",
                ],
                exportRows,
            );
            return;
        }
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

        downloadFile(`/api/account/usage?${params.toString()}`);
    }

    return (
        <div className="@container flex min-w-0 flex-col gap-4">
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
                        label={
                            period.bucket !== undefined ? "Summary CSV" : "CSV"
                        }
                    />
                }
            >
                <ActivityFilter
                    label="Keys"
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
            </ActivityToolbar>

            <UsageChartView
                loading={loading}
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
    "loading" | "error" | "fetchUsage" | "chartData" | "stats" | "hasData"
> & {
    metric: Metric;
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
    period,
    onPeriodChange,
}) => {
    const hasUsage = hasData;

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
                        key={`${period.granularity}:${period.period}`}
                        period={period}
                        label="Usage"
                        onClearSelection={() =>
                            onPeriodChange({ ...period, bucket: undefined })
                        }
                        onSelect={(point) =>
                            onPeriodChange(
                                toggleActivityBucket(period, point.timestamp),
                            )
                        }
                        data={chartData}
                        metric={metric}
                    />
                )}
                {!loading && !error && !hasUsage && <UsageEmptyState />}
            </div>

            {!loading && !error && hasUsage && (
                <ModelBreakdownTable stats={stats} />
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
    stats: ReturnType<typeof useUsageData>["stats"];
};

const ModelBreakdownTable: FC<ModelBreakdownTableProps> = ({ stats }) => (
    <div className="min-w-0 max-w-full overflow-x-auto">
        <Table
            aria-label="Usage by model"
            className="min-w-[420px] [&_tr:hover]:bg-transparent"
        >
            <TableHead className="sr-only">
                <TableRow>
                    <TableHeaderCell scope="col">Model</TableHeaderCell>
                    <TableHeaderCell scope="col" align="right">
                        Share
                    </TableHeaderCell>
                    <TableHeaderCell scope="col" align="right">
                        Pollen
                    </TableHeaderCell>
                </TableRow>
            </TableHead>
            <TableBody className="[&>tr]:border-divider!">
                {stats.modelBreakdowns.map((model) => (
                    <TableRow key={model.model}>
                        <TableCell className="max-w-64 break-words text-xs">
                            {model.label}
                        </TableCell>
                        <TableCell align="right" numeric className="text-xs">
                            {stats.totalPollen > 0
                                ? (
                                      (model.pollen / stats.totalPollen) *
                                      100
                                  ).toFixed(1)
                                : "0.0"}
                            %
                        </TableCell>
                        <TableCell align="right" numeric className="text-xs">
                            <PollenUsageBadges {...model} />
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
                        <PollenUsageBadges {...stats} />
                    </TableCell>
                </TableRow>
            </tfoot>
        </Table>
    </div>
);
