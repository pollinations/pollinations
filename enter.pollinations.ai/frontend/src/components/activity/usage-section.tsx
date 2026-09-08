import {
    InlineLink,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    UsageIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import { useMemo } from "react";
import {
    ActivityFilter,
    CsvDownloadButton,
    downloadFile,
    PollenUsageBadges,
} from "./activity-helpers";
import { Chart } from "./chart";
import { MetricTabs } from "./metric-tabs";
import type { FilterState, Metric, UsagePeriodSelection } from "./types";
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

        downloadFile(`/api/account/usage?${params.toString()}`);
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 font-body text-base font-semibold text-theme-text-strong">
                    <UsageIcon className="h-4 w-4 shrink-0" />
                    Usage
                </div>
                <CsvDownloadButton
                    disabled={downloadDisabled}
                    disabledReason={downloadDisabledReason}
                    onClick={downloadDetailedUsage}
                />
            </div>
            <Surface className="flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-start gap-2">
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
        <Table aria-label="Usage by model" className="min-w-[420px]">
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
            <TableBody>
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
