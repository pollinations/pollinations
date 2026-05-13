import type { FC, ReactNode } from "react";
import { useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { Button } from "../button.tsx";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import type { ThemeName } from "../layout/dashboard-theme.ts";
import { Chip } from "../ui/chip.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { Chart } from "./chart";
import { MultiSelect } from "./multi-select";
import type { UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    apps: Array<{ id: string; name: string }>;
    theme: ThemeName;
};

import { PAID_COLOR, TIER_COLOR } from "@/client/lib/balance-colors.ts";

export const EarningsGraph: FC<EarningsGraphProps> = ({
    period,
    apps,
    theme,
}) => {
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
        <DashboardSection
            title="Earnings"
            theme={theme}
            framed
            action={
                <Button
                    as="button"
                    theme={theme}
                    onClick={downloadEarnings}
                    className="flex items-center gap-1.5"
                >
                    <svg
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
                        <title>Download</title>
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
                            theme={theme}
                        />
                    </div>
                </div>

                <div className="border-t pt-4 border-theme-border-soft">
                    {loading && (
                        <div className="flex items-center justify-center h-[180px]">
                            <p className="text-sm text-gray-400 animate-[pulse_2s_ease-in-out_infinite]">
                                Fetching earnings data…
                            </p>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="flex items-center justify-center h-[180px]">
                            <div className="text-center">
                                <p className="text-sm text-red-500 font-medium">
                                    {error}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => fetchEarnings()}
                                    className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
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
                            paidBarColor={PAID_COLOR}
                            tierBarColor={TIER_COLOR}
                        />
                    )}
                </div>

                <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:gap-0 sm:divide-x border-theme-border-soft divide-theme-divide">
                    <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                        <EarningsStatCard
                            theme={theme}
                            label="Pollen earned"
                            value={formatPollen(stats.totalPollen)}
                            detail={
                                stats.totalPollen > 0 ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tooltip
                                            content={`${formatPollen(stats.totalPaid)} pollen from paid-side spend`}
                                            displayContents
                                        >
                                            <Chip
                                                intent="paid"
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                💳{" "}
                                                <span className="tabular-nums">
                                                    {formatPollen(
                                                        stats.totalPaid,
                                                    )}
                                                </span>
                                            </Chip>
                                        </Tooltip>
                                        <Tooltip
                                            content={`${formatPollen(stats.totalTier)} pollen from tier-side spend`}
                                            displayContents
                                        >
                                            <Chip
                                                intent="tier"
                                                size="lg"
                                                className="font-semibold"
                                            >
                                                🌱{" "}
                                                <span className="tabular-nums">
                                                    {formatPollen(
                                                        stats.totalTier,
                                                    )}
                                                </span>
                                            </Chip>
                                        </Tooltip>
                                    </div>
                                ) : null
                            }
                        />
                    </div>
                    <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                        <EarningsStatCard
                            theme={theme}
                            label="Active users"
                            value={stats.activeUsers.toLocaleString()}
                            detail={
                                stats.appCount > 0 ? (
                                    <span className="text-theme-text-muted">
                                        across {stats.appCount} app
                                        {stats.appCount === 1 ? "" : "s"}
                                    </span>
                                ) : (
                                    "No users yet"
                                )
                            }
                        />
                    </div>
                    <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                        <EarningsStatCard
                            theme={theme}
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
                    </div>
                </div>
            </div>
        </DashboardSection>
    );
};

const EarningsStatCard: FC<{
    theme: ThemeName;
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}> = ({ theme, label, value, detail }) => (
    <div data-theme={theme} className="text-sm">
        <div className="text-micro uppercase tracking-wide font-bold text-theme-text-soft">
            {label}
        </div>
        <div className="mt-1 min-h-8 break-words text-2xl font-bold leading-tight tabular-nums text-theme-text-base">
            {value}
        </div>
        {detail && (
            <div className="mt-2 text-xs text-theme-text-muted">{detail}</div>
        )}
    </div>
);

export default EarningsGraph;
