import {
    Button,
    CardIcon,
    Chip,
    DownloadIcon,
    InlineLink,
    MultiSelect,
    Section,
    SproutIcon,
    StatCard,
    Surface,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useState } from "react";
import { Chart } from "./chart";
import { formatActivityPollen } from "./format-activity-pollen";
import type { UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    apps: Array<{ id: string; name: string }>;
};

export const EarningsGraph: FC<EarningsGraphProps> = ({ period, apps }) => {
    const [selectedAppKeyIds, setSelectedAppKeyIds] = useState<string[]>([]);

    const appSelectOptions = apps.map((a) => ({
        value: a.id,
        label: a.name,
    }));

    const { loading, error, fetchEarnings, chartData, stats } = useEarningsData(
        {
            period,
            selectedAppKeyIds,
        },
    );

    const showAppBreakdown = apps.length > 0;
    const hasEarnings = stats.totalPollen > 0;
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
            params.set("api_key_ids", selectedAppKeyIds.join(","));
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
        <Section title="App earnings" framed action={downloadAction}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-start gap-4 sm:justify-end">
                    <div className="flex flex-col items-stretch gap-2 [&>div]:justify-between [&_button]:w-60">
                        <MultiSelect
                            options={appSelectOptions}
                            selected={selectedAppKeyIds}
                            onChange={setSelectedAppKeyIds}
                            placeholder="All"
                            disabled={appSelectOptions.length === 0}
                            disabledText="None"
                            align="end"
                            label="Apps"
                        />
                    </div>
                </div>

                <Surface>
                    {loading && (
                        <div className="flex items-center justify-center h-[180px]">
                            <p className="text-sm text-theme-text-muted animate-[pulse_2s_ease-in-out_infinite]">
                                Fetching earnings data…
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
                                metric="pollen"
                                showModelBreakdown={showAppBreakdown}
                            />
                        ) : (
                            <EarningsEmptyState />
                        ))}
                </Surface>

                {hasEarnings && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Surface>
                            <StatCard
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
                                    </div>
                                }
                            />
                        </Surface>
                        <Surface>
                            <StatCard
                                label="Active users"
                                value={stats.activeUsers.toLocaleString()}
                                detail={
                                    <span className="text-theme-text-soft">
                                        across {stats.appCount} app
                                        {stats.appCount === 1 ? "" : "s"}
                                    </span>
                                }
                            />
                        </Surface>
                        <Surface>
                            <StatCard
                                label="Top app"
                                value={
                                    <span className="text-xl leading-tight">
                                        {stats.topApp?.label || "None"}
                                    </span>
                                }
                                detail={
                                    stats.topApp ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {stats.topApp.uniqueUsers > 0 && (
                                                <Chip
                                                    size="lg"
                                                    className="font-semibold"
                                                >
                                                    <span className="tabular-nums">
                                                        {stats.topApp.uniqueUsers.toLocaleString()}
                                                    </span>
                                                    <span className="font-medium opacity-70">
                                                        {stats.topApp
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
                                                        stats.topApp.pollen,
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
                        </Surface>
                    </div>
                )}
            </div>
        </Section>
    );
};

const EarningsEmptyState: FC = () => (
    <p className="text-sm text-ink-600">
        No earnings in this selected period. Once users start spending pollen
        through your app, earnings will appear here.{" "}
        <InlineLink href="#keys" showIcon={false}>
            Create an App key
        </InlineLink>
        .
    </p>
);

export default EarningsGraph;
