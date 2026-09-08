import {
    Button,
    CardIcon,
    Chip,
    DownloadIcon,
    EarningsIcon,
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
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { Chart } from "./chart";
import { formatActivityPollen } from "./format-activity-pollen";
import { MetricTabs } from "./metric-tabs";
import type { Metric, UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedAppKeyIds: string[];
    selectedModelIds: string[];
    onMetricChange: (metric: Metric) => void;
    onSelectedAppKeyIdsChange: (keyIds: string[]) => void;
    onSelectedModelIdsChange: (modelIds: string[]) => void;
};

export const EarningsGraph: FC<EarningsGraphProps> = ({
    period,
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
        stats,
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

    const showEarningsBreakdown = stats.entityCount > 0;
    const hasEarnings = stats.totalRequests > 0 || stats.totalPollen > 0;
    const downloadDisabled = loading || !hasEarnings;
    const downloadDisabledReason = loading
        ? "Loading earnings data"
        : "No earnings to download for this selected period";

    function downloadEarnings(): void {
        if (downloadDisabled) return;

        const params = new URLSearchParams({
            format: "csv",
            granularity: period.granularity,
            period: period.period,
        });

        const anchor = document.createElement("a");
        anchor.href = `/api/account/earnings?${params.toString()}`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    const downloadButton = (
        <Button
            as="button"
            onClick={downloadEarnings}
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
                    <EarningsIcon className="h-4 w-4 shrink-0" />
                    Earnings
                </div>
                {downloadAction}
            </div>
            <Surface className="flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-start gap-2">
                        <div className="flex w-full items-center gap-3">
                            <span className="w-20 shrink-0 text-xs font-medium text-theme-text-soft">
                                Apps
                            </span>
                            <div className="min-w-0 flex-1 max-w-60 [&_button]:w-full">
                                {appSelectOptions.length === 0 ? (
                                    <span className="inline-flex min-h-8 items-center text-xs text-theme-text-muted">
                                        No app earnings in this period
                                    </span>
                                ) : (
                                    <MultiSelect
                                        options={appSelectOptions}
                                        selected={selectedAppKeyIds}
                                        onChange={onSelectedAppKeyIdsChange}
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
                                        No model earnings in this period
                                    </span>
                                ) : (
                                    <MultiSelect
                                        options={modelSelectOptions}
                                        selected={selectedModelIds}
                                        onChange={onSelectedModelIdsChange}
                                        placeholder="All"
                                        align="start"
                                    />
                                )}
                            </div>
                        </div>
                        <MetricTabs value={metric} onChange={onMetricChange} />
                    </div>

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
                                    data={chartData}
                                    metric={metric}
                                    showModelBreakdown={showEarningsBreakdown}
                                />
                            ) : (
                                <EarningsEmptyState />
                            ))}
                    </div>

                    {!loading && !error && hasEarnings && (
                        <>
                            <div className="min-w-0 max-w-full overflow-x-auto">
                                <Table
                                    aria-label="Earnings by source"
                                    className="min-w-[520px]"
                                >
                                    <TableHead>
                                        <TableRow>
                                            <TableHeaderCell scope="col">
                                                Name
                                            </TableHeaderCell>
                                            <TableHeaderCell scope="col">
                                                Source
                                            </TableHeaderCell>
                                            <TableHeaderCell
                                                scope="col"
                                                align="right"
                                            >
                                                Share
                                            </TableHeaderCell>
                                            <TableHeaderCell
                                                scope="col"
                                                align="right"
                                            >
                                                Pollen
                                            </TableHeaderCell>
                                            <TableHeaderCell
                                                scope="col"
                                                align="right"
                                            >
                                                Requests
                                            </TableHeaderCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {stats.entityBreakdowns.map(
                                            (entity) => (
                                                <TableRow key={entity.id}>
                                                    <TableCell className="max-w-64 break-words text-xs">
                                                        {entity.label}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip size="sm">
                                                            {entity.source ===
                                                            "byop_markup"
                                                                ? "Pollen Connect"
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
                                                        {formatActivityPollen(
                                                            entity.pollen,
                                                        )}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        className="text-xs"
                                                    >
                                                        {entity.requests.toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ),
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-divider pt-4">
                                <StatCard
                                    className="min-w-0"
                                    label="Pollen"
                                    value={formatActivityPollen(
                                        stats.totalPollen,
                                    )}
                                    detail={
                                        <div className="flex flex-wrap items-center gap-2">
                                            <PaidChip
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                <CardIcon className="h-4 w-4" />
                                                <span className="tabular-nums">
                                                    {formatActivityPollen(
                                                        stats.totalPaid,
                                                    )}
                                                </span>
                                            </PaidChip>
                                            <TierChip
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                <SproutIcon className="h-4 w-4" />
                                                <span className="tabular-nums">
                                                    {formatActivityPollen(
                                                        stats.totalTier,
                                                    )}
                                                </span>
                                            </TierChip>
                                        </div>
                                    }
                                />
                                <StatCard
                                    className="min-w-0"
                                    label="Requests"
                                    value={stats.totalRequests.toLocaleString()}
                                    detail={
                                        stats.entityCount > 0 ? (
                                            <span className="text-theme-text-soft">
                                                across {stats.entityCount}{" "}
                                                source
                                                {stats.entityCount === 1
                                                    ? ""
                                                    : "s"}
                                            </span>
                                        ) : null
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            </Surface>
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
