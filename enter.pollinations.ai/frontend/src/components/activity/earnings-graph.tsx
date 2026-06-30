import {
    Button,
    CardIcon,
    Chip,
    DownloadIcon,
    InlineLink,
    MultiSelect,
    SproutIcon,
    StatCard,
    Surface,
    TabButton,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { Chart } from "./chart";
import { formatActivityPollen } from "./format-activity-pollen";
import type { Metric, UsagePeriodSelection } from "./types";
import {
    formatEarningsSourceLabel,
    useEarningsData,
} from "./use-earnings-data";

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
        <div className="flex w-60 flex-wrap justify-end gap-1.5">
            {METRIC_OPTIONS.map((metric) => (
                <TabButton
                    key={metric}
                    active={value === metric}
                    onClick={() => onChange(metric)}
                    size="sm"
                    className="flex-1"
                >
                    {METRIC_LABELS[metric]}
                </TabButton>
            ))}
        </div>
    </div>
);

type EarningsGraphProps = {
    period: UsagePeriodSelection;
};

export const EarningsGraph: FC<EarningsGraphProps> = ({ period }) => {
    const [metric, setMetric] = useState<Metric>("pollen");
    const [selectedAppKeyIds, setSelectedAppKeyIds] = useState<string[]>([]);

    const { loading, error, fetchEarnings, usedApps, chartData, stats } =
        useEarningsData({
            period,
            metric,
            selectedAppKeyIds,
        });

    useEffect(() => {
        const validAppIds = new Set(usedApps.map((app) => app.id));
        const validSelectedAppKeyIds = selectedAppKeyIds.filter((id) =>
            validAppIds.has(id),
        );
        if (validSelectedAppKeyIds.length !== selectedAppKeyIds.length) {
            setSelectedAppKeyIds(validSelectedAppKeyIds);
        }
    }, [usedApps, selectedAppKeyIds]);

    const appSelectOptions = usedApps.map((app) => ({
        value: app.id,
        label: app.label,
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
        if (selectedAppKeyIds.length > 0) {
            params.set("entity_ids", selectedAppKeyIds.join(","));
        }

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
        <Surface className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-theme-text-strong">
                    App earnings
                </h3>
                {downloadAction}
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-end gap-4">
                    <div className="flex flex-col items-stretch gap-2">
                        <div className="[&>div]:justify-between [&_button]:w-60">
                            <MultiSelect
                                options={appSelectOptions}
                                selected={selectedAppKeyIds}
                                onChange={setSelectedAppKeyIds}
                                placeholder="All"
                                disabled={appSelectOptions.length === 0}
                                disabledText="None"
                                align="end"
                                label="BYOP apps"
                            />
                        </div>
                        <MetricTabs value={metric} onChange={setMetric} />
                    </div>
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

                {hasEarnings && (
                    <div className="grid gap-4 border-t border-divider pt-4 sm:grid-cols-3">
                        <StatCard
                            className="min-w-0"
                            label="Pollen earned"
                            value={formatActivityPollen(stats.totalPollen)}
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
                                    {stats.appMarkupPollen > 0 && (
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span className="tabular-nums">
                                                {formatActivityPollen(
                                                    stats.appMarkupPollen,
                                                )}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                app markup
                                            </span>
                                        </Chip>
                                    )}
                                    {stats.modelRewardPollen > 0 && (
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span className="tabular-nums">
                                                {formatActivityPollen(
                                                    stats.modelRewardPollen,
                                                )}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                model rewards
                                            </span>
                                        </Chip>
                                    )}
                                </div>
                            }
                        />
                        <StatCard
                            className="min-w-0"
                            label="Earning sources"
                            value={stats.sourceSummaries.length.toLocaleString()}
                            detail={
                                <div className="flex flex-wrap items-center gap-2">
                                    {stats.sourceSummaries.map((source) => (
                                        <Chip
                                            key={source.source}
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span>{source.label}</span>
                                            <span className="tabular-nums">
                                                {source.requests.toLocaleString()}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                req
                                            </span>
                                            {source.uniqueUsers > 0 && (
                                                <>
                                                    <span className="tabular-nums">
                                                        {source.uniqueUsers.toLocaleString()}
                                                    </span>
                                                    <span className="font-medium opacity-70">
                                                        users
                                                    </span>
                                                </>
                                            )}
                                            <span className="tabular-nums">
                                                {formatRewardRate(
                                                    source.rewardRate,
                                                )}
                                            </span>
                                        </Chip>
                                    ))}
                                </div>
                            }
                        />
                        <StatCard
                            className="min-w-0"
                            label="Top earner"
                            value={
                                <span className="text-xl leading-tight">
                                    {stats.topEntity?.label || "None"}
                                </span>
                            }
                            detail={
                                stats.topEntity ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            {formatEarningsSourceLabel(
                                                stats.topEntity.source,
                                            )}
                                        </Chip>
                                        {stats.topEntity.uniqueUsers > 0 && (
                                            <Chip
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                <span className="tabular-nums">
                                                    {stats.topEntity.uniqueUsers.toLocaleString()}
                                                </span>
                                                <span className="font-medium opacity-70">
                                                    {stats.topEntity
                                                        .uniqueUsers === 1
                                                        ? "user"
                                                        : "users"}
                                                </span>
                                            </Chip>
                                        )}
                                        <Chip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <span className="tabular-nums">
                                                {formatActivityPollen(
                                                    stats.topEntity.pollen,
                                                )}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                pollen
                                            </span>
                                        </Chip>
                                    </div>
                                ) : null
                            }
                        />
                    </div>
                )}
            </div>
        </Surface>
    );
};

const EarningsEmptyState: FC = () => (
    <p className="text-sm text-ink-600">
        No earnings in this selected period. Once users start spending pollen
        through your apps or community models, earnings will appear here.{" "}
        <InlineLink href="#keys" showIcon={false}>
            Create an App key
        </InlineLink>
        .
    </p>
);

function formatRewardRate(value: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
    }).format(value);
}

export default EarningsGraph;
