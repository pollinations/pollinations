import {
    Chip,
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
    PollenUsageBadges,
} from "./activity-helpers";
import { type ActivityPeriod, toggleActivityBucket } from "./activity-period";
import { ActivityToolbar } from "./activity-toolbar";
import { Chart } from "./chart";
import type { Metric, UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    onPeriodChange: (period: ActivityPeriod) => void;
    metric: Metric;
    selectedAppKeyIds: string[];
    selectedModelIds: string[];
    onMetricChange: (metric: Metric) => void;
    onSelectedAppKeyIdsChange: (keyIds: string[]) => void;
    onSelectedModelIdsChange: (modelIds: string[]) => void;
};

export const EarningsGraph: FC<EarningsGraphProps> = ({
    period,
    onPeriodChange,
    metric,
    selectedAppKeyIds,
    selectedModelIds,
    onMetricChange,
    onSelectedAppKeyIdsChange,
    onSelectedModelIdsChange,
}) => {
    const {
        loading,
        error,
        fetchEarnings,
        usedApps,
        usedModels,
        chartData,
        hasData,
        stats,
        exportRows,
    } = useEarningsData({
        period,
        metric,
        selectedAppKeyIds,
        selectedModelIds,
    });

    const appSelectOptions = usedApps.map((app) => ({
        value: app.id,
        label: app.label,
    }));
    const modelSelectOptions = usedModels.map((model) => ({
        value: model.id,
        label: model.label,
    }));

    const hasEarnings = hasData;
    const downloadDisabled =
        loading || (stats.totalRequests === 0 && stats.totalPollen === 0);
    const downloadDisabledReason = loading
        ? "Loading earnings data"
        : "No earnings to download for this selected period";

    function downloadEarnings(): void {
        if (downloadDisabled) return;

        downloadActivityCsv(
            `earnings-${period.period}${period.bucket !== undefined ? `-${period.bucket}` : ""}`,
            [
                "date",
                "source",
                "entity_id",
                "entity_name",
                "requests",
                "paid_requests",
                "tier_requests",
                "baseline_price",
                "pollen_earned",
                "paid_earned",
                "tier_earned",
                "cost_usd",
                "reward_rate",
            ],
            exportRows,
        );
    }

    return (
        <div className="@container flex min-w-0 flex-col gap-4">
            <ActivityToolbar
                label="Earnings"
                period={period}
                onPeriodChange={onPeriodChange}
                metric={metric}
                onMetricChange={onMetricChange}
                download={
                    <CsvDownloadButton
                        disabled={downloadDisabled}
                        disabledReason={downloadDisabledReason}
                        onClick={downloadEarnings}
                    />
                }
            >
                <ActivityFilter
                    label="Apps"
                    options={appSelectOptions}
                    selected={selectedAppKeyIds}
                    onChange={onSelectedAppKeyIdsChange}
                    emptyMessage="No app earnings in this period"
                />
                <ActivityFilter
                    label="Models"
                    options={modelSelectOptions}
                    selected={selectedModelIds}
                    onChange={onSelectedModelIdsChange}
                    emptyMessage="No model earnings in this period"
                />
            </ActivityToolbar>

            <div className="min-h-[180px]">
                {loading && (
                    <div className="flex items-center justify-center h-[180px]">
                        <p className="text-sm text-theme-text-muted animate-[pulse_2s_ease-in-out_infinite]">
                            Fetching earnings data...
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
                                onClick={() => fetchEarnings()}
                                className="mt-2 text-xs text-intent-danger-text hover:text-intent-danger-text underline"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )}
                {!loading &&
                    !error &&
                    (hasEarnings ? (
                        <Chart
                            key={`${period.granularity}:${period.period}`}
                            period={period}
                            label="Earnings"
                            onClearSelection={() =>
                                onPeriodChange({
                                    ...period,
                                    bucket: undefined,
                                })
                            }
                            onSelect={(point) =>
                                onPeriodChange(
                                    toggleActivityBucket(
                                        period,
                                        point.timestamp,
                                    ),
                                )
                            }
                            data={chartData}
                            metric={metric}
                        />
                    ) : (
                        <EarningsEmptyState />
                    ))}
            </div>

            {!loading && !error && hasEarnings && (
                <div className="min-w-0 max-w-full overflow-x-auto">
                    <Table
                        aria-label="Earnings by source"
                        className="min-w-[520px] [&_tr:hover]:bg-transparent"
                    >
                        <TableHead className="sr-only">
                            <TableRow>
                                <TableHeaderCell scope="col">
                                    Name
                                </TableHeaderCell>
                                <TableHeaderCell scope="col">
                                    Source
                                </TableHeaderCell>
                                <TableHeaderCell scope="col" align="right">
                                    Share
                                </TableHeaderCell>
                                <TableHeaderCell scope="col" align="right">
                                    Pollen
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody className="[&>tr]:border-divider!">
                            {stats.entityBreakdowns.map((entity) => (
                                <TableRow key={entity.id}>
                                    <TableCell className="max-w-64 break-words text-xs">
                                        {entity.label}
                                    </TableCell>
                                    <TableCell>
                                        <Chip size="sm" intent="neutral">
                                            {entity.source === "byop_markup"
                                                ? "App"
                                                : "Model"}
                                        </Chip>
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="text-xs"
                                    >
                                        {stats.totalPollen > 0
                                            ? (
                                                  (entity.pollen /
                                                      stats.totalPollen) *
                                                  100
                                              ).toFixed(1)
                                            : "0.0"}
                                        %
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="text-xs"
                                    >
                                        <PollenUsageBadges {...entity} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <tfoot className="border-t border-divider font-semibold">
                            <TableRow>
                                <TableHeaderCell scope="row" colSpan={3}>
                                    Total
                                </TableHeaderCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className="text-xs"
                                >
                                    <PollenUsageBadges
                                        paidPollen={stats.totalPaid}
                                        tierPollen={stats.totalTier}
                                        paidRequests={stats.paidRequests}
                                        tierRequests={stats.tierRequests}
                                    />
                                </TableCell>
                            </TableRow>
                        </tfoot>
                    </Table>
                </div>
            )}
        </div>
    );
};

const EarningsEmptyState: FC = () => (
    <p className="text-sm text-ink-600">
        No earnings in this selected period. Once users start spending pollen
        through your apps or community models, earnings will appear here.{" "}
        <InlineLink href="/keys" showIcon={false}>
            Create an App key
        </InlineLink>
        .
    </p>
);

export default EarningsGraph;
