import type { FC, ReactNode } from "react";
import { useState } from "react";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { Tag } from "../ui/tag.tsx";
import { Chart } from "./chart";
import { MultiSelect } from "./multi-select";
import { PeriodPicker } from "./period-picker.tsx";
import type { UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    onPeriodChange: (period: UsagePeriodSelection) => void;
    apps: Array<{ id: string; name: string }>;
    action?: ReactNode;
};

export const EarningsGraph: FC<EarningsGraphProps> = ({
    period,
    onPeriodChange,
    apps,
    action,
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

    const showAppBreakdown = apps.length > 1;

    return (
        <div className="flex flex-col gap-6">
            <DashboardSection
                title="Earnings"
                theme="yellow"
                framed
                action={action}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <PeriodPicker
                            value={period}
                            onChange={onPeriodChange}
                            theme="yellow"
                        />
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
                                theme="yellow"
                            />
                        </div>
                    </div>

                    <div className="border-t border-yellow-300/70 pt-4">
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
                                paidBarColor={{
                                    base: "#fef9c3",
                                    hover: "#fef08a",
                                }}
                            />
                        )}
                    </div>

                    <div className="flex flex-col gap-4 border-t border-yellow-300/70 pt-4 sm:flex-row sm:gap-0 sm:divide-x sm:divide-yellow-300/70">
                        <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                            <EarningsStatCard
                                label="Pollen earned"
                                value={formatPollen(stats.totalPollen)}
                                detail={
                                    stats.averageMarkupRate > 0 ? (
                                        <Tag
                                            color="yellow"
                                            size="lg"
                                            className="font-semibold text-yellow-900"
                                            title="Weighted average markup applied across served requests"
                                        >
                                            <span aria-hidden="true">📈</span>
                                            <span className="tabular-nums">
                                                {formatPercent(
                                                    stats.averageMarkupRate,
                                                )}
                                            </span>{" "}
                                            avg markup
                                        </Tag>
                                    ) : null
                                }
                            />
                        </div>
                        <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                            <EarningsStatCard
                                label="Active users"
                                value={stats.activeUsers.toLocaleString()}
                                detail={
                                    stats.appCount > 0 ? (
                                        <span className="text-yellow-900/75">
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
                                label="Top app"
                                value={
                                    <span className="text-xl leading-tight">
                                        {stats.topApp?.label || "None"}
                                    </span>
                                }
                                detail={
                                    stats.topApp ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tag
                                                color="yellow"
                                                size="lg"
                                                className="font-semibold text-yellow-900"
                                                title={`${formatPollen(stats.topApp.pollen)} pollen earned`}
                                            >
                                                <span aria-hidden="true">
                                                    🪷
                                                </span>
                                                <span className="tabular-nums">
                                                    {formatPollen(
                                                        stats.topApp.pollen,
                                                    )}
                                                </span>
                                            </Tag>
                                            {stats.topApp.uniqueUsers > 0 && (
                                                <Tag
                                                    color="yellow"
                                                    size="lg"
                                                    className="font-semibold text-yellow-900"
                                                    title={`${stats.topApp.uniqueUsers.toLocaleString()} distinct user${stats.topApp.uniqueUsers === 1 ? "" : "s"}`}
                                                >
                                                    <span aria-hidden="true">
                                                        👥
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {stats.topApp.uniqueUsers.toLocaleString()}
                                                    </span>
                                                </Tag>
                                            )}
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
            {!loading && !error && (
                <p className="text-[10px] text-gray-400">
                    Data refreshes every hour. Times shown in UTC.
                </p>
            )}
        </div>
    );
};

const formatPollen = (value: number): string => {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.01) return value.toPrecision(2);
    return value.toFixed(2);
};

const formatPercent = (value: number): string => {
    const pct = value * 100;
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
};

const EarningsStatCard: FC<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}> = ({ label, value, detail }) => (
    <div className="text-sm">
        <div className="text-[10px] uppercase tracking-wide text-yellow-800 font-bold">
            {label}
        </div>
        <div className="mt-1 min-h-8 break-words text-2xl font-bold leading-tight text-yellow-900 tabular-nums">
            {value}
        </div>
        {detail && (
            <div className="mt-2 text-xs text-yellow-900/75">{detail}</div>
        )}
    </div>
);

export default EarningsGraph;
