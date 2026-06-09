import {
    Button,
    CardIcon,
    Chip,
    MultiSelect,
    Section,
    SproutIcon,
    StatCard,
    Surface,
    Tooltip,
} from "@pollinations/ui";
import {
    formatPollen,
    PAID_BALANCE_CHART_COLOR,
    PaidChip,
    TIER_BALANCE_CHART_COLOR,
    TierChip,
} from "@pollinations/ui/wallet";
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
                    <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
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
                            paidBarColor={PAID_BALANCE_CHART_COLOR}
                            tierBarColor={TIER_BALANCE_CHART_COLOR}
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
                                        <Tooltip
                                            content={`${formatPollen(stats.totalPaid)} pollen from paid-side spend`}
                                            displayContents
                                        >
                                            <PaidChip
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                <CardIcon className="h-4 w-4" />
                                                <span className="tabular-nums">
                                                    {formatPollen(
                                                        stats.totalPaid,
                                                    )}
                                                </span>
                                            </PaidChip>
                                        </Tooltip>
                                        <Tooltip
                                            content={`${formatPollen(stats.totalTier)} pollen from tier-side spend`}
                                            displayContents
                                        >
                                            <TierChip
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                <SproutIcon className="h-4 w-4" />
                                                <span className="tabular-nums">
                                                    {formatPollen(
                                                        stats.totalTier,
                                                    )}
                                                </span>
                                            </TierChip>
                                        </Tooltip>
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
                                            <Tooltip
                                                content={`${stats.topApp.uniqueUsers.toLocaleString()} distinct user${stats.topApp.uniqueUsers === 1 ? "" : "s"}`}
                                                displayContents
                                            >
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
                                            </Tooltip>
                                        )}
                                        <Tooltip
                                            content={`${formatPollen(stats.topApp.pollen)} pollen earned`}
                                            displayContents
                                        >
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
                                        </Tooltip>
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
