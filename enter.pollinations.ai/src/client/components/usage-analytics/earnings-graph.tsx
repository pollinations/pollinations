import type { FC, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { type DashboardTheme, themeTokens } from "../layout/dashboard-theme.ts";
import { Tag } from "../ui/tag.tsx";
import { Chart } from "./chart";
import { MultiSelect } from "./multi-select";
import type { UsagePeriodSelection } from "./types";
import { useEarningsData } from "./use-earnings-data";

type EarningsGraphProps = {
    period: UsagePeriodSelection;
    apps: Array<{ id: string; name: string }>;
    theme: DashboardTheme;
    action?: ReactNode;
};

const PAID_BAR_COLOR = { base: "#fbcfe8", hover: "#f9a8d4" } as const;

export const EarningsGraph: FC<EarningsGraphProps> = ({
    period,
    apps,
    theme,
    action,
}) => {
    const tokens = themeTokens[theme];
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
        <DashboardSection title="Earnings" theme={theme} framed action={action}>
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

                <div className={cn("border-t pt-4", tokens.border.soft)}>
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
                            paidBarColor={PAID_BAR_COLOR}
                        />
                    )}
                </div>

                <div
                    className={cn(
                        "flex flex-col gap-4 border-t pt-4 sm:flex-row sm:gap-0 sm:divide-x",
                        tokens.border.soft,
                        tokens.divide,
                    )}
                >
                    <div className="flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                        <EarningsStatCard
                            theme={theme}
                            label="Pollen earned"
                            value={formatPollen(stats.totalPollen)}
                            detail={
                                stats.averageMarkupRate > 0 ? (
                                    <Tag
                                        color={theme}
                                        size="lg"
                                        className={cn(
                                            "font-semibold",
                                            tokens.text.base,
                                        )}
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
                            theme={theme}
                            label="Active users"
                            value={
                                stats.activeUsers === null
                                    ? "—"
                                    : stats.activeUsers.toLocaleString()
                            }
                            detail={
                                stats.activeUsers === null ? (
                                    <span className={tokens.text.muted}>
                                        select a single app for distinct users
                                    </span>
                                ) : stats.appCount > 0 ? (
                                    <span className={tokens.text.muted}>
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
                                        <Tag
                                            color={theme}
                                            size="lg"
                                            className={cn(
                                                "font-semibold",
                                                tokens.text.base,
                                            )}
                                            title={`${formatPollen(stats.topApp.pollen)} pollen earned`}
                                        >
                                            <span aria-hidden="true">🪷</span>
                                            <span className="tabular-nums">
                                                {formatPollen(
                                                    stats.topApp.pollen,
                                                )}
                                            </span>
                                        </Tag>
                                        {stats.topApp.uniqueUsers > 0 && (
                                            <Tag
                                                color={theme}
                                                size="lg"
                                                className={cn(
                                                    "font-semibold",
                                                    tokens.text.base,
                                                )}
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
    theme: DashboardTheme;
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}> = ({ theme, label, value, detail }) => {
    const tokens = themeTokens[theme];
    return (
        <div className="text-sm">
            <div
                className={cn(
                    "text-[10px] uppercase tracking-wide font-bold",
                    tokens.text.soft,
                )}
            >
                {label}
            </div>
            <div
                className={cn(
                    "mt-1 min-h-8 break-words text-2xl font-bold leading-tight tabular-nums",
                    tokens.text.base,
                )}
            >
                {value}
            </div>
            {detail && (
                <div className={cn("mt-2 text-xs", tokens.text.muted)}>
                    {detail}
                </div>
            )}
        </div>
    );
};

export default EarningsGraph;
