import {
    Button,
    CardIcon,
    Chip,
    DownloadIcon,
    MultiSelect,
    Section,
    SproutIcon,
    StatCard,
    Surface,
} from "@pollinations/ui";
import { formatPollen, PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useState } from "react";
import { Chart } from "./chart";
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

    function downloadEarnings(): void {
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

    return (
        <Section
            title="Earnings"
            framed
            action={
                <Button
                    as="button"
                    onClick={downloadEarnings}
                    className="flex items-center gap-1.5"
                >
                    <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                    Download CSV
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-end gap-4">
                    <div className="flex flex-col items-stretch gap-2 [&>div]:justify-between [&_button]:min-w-[160px]">
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
                    {!loading && !error && (
                        <Chart
                            data={chartData}
                            metric="pollen"
                            showModelBreakdown={showAppBreakdown}
                        />
                    )}
                </Surface>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Surface>
                        <StatCard
                            label="Pollen earned"
                            value={formatPollen(stats.totalPollen)}
                            detail={
                                stats.totalPollen > 0 ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <PaidChip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <CardIcon className="h-4 w-4" />
                                            <span className="tabular-nums">
                                                {formatPollen(stats.totalPaid)}
                                            </span>
                                        </PaidChip>
                                        <TierChip
                                            size="lg"
                                            className="font-semibold"
                                        >
                                            <SproutIcon className="h-4 w-4" />
                                            <span className="tabular-nums">
                                                {formatPollen(stats.totalTier)}
                                            </span>
                                        </TierChip>
                                    </div>
                                ) : null
                            }
                        />
                    </Surface>
                    <Surface>
                        <StatCard
                            label="Active users"
                            value={stats.activeUsers.toLocaleString()}
                            detail={
                                stats.appCount > 0 ? (
                                    <span className="text-theme-text-soft">
                                        across {stats.appCount} app
                                        {stats.appCount === 1 ? "" : "s"}
                                    </span>
                                ) : (
                                    "No users yet"
                                )
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
                                                {formatPollen(
                                                    stats.topApp.pollen,
                                                )}
                                            </span>
                                            <span className="font-medium opacity-70">
                                                pollen
                                            </span>
                                        </Chip>
                                    </div>
                                ) : (
                                    "No earnings yet"
                                )
                            }
                        />
                    </Surface>
                </div>
            </div>
        </Section>
    );
};

export default EarningsGraph;
