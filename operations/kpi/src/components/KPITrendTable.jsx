import {
    Heading,
    InfoTip,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useState } from "react";
import {
    calcChange,
    currentWeekStart,
    formatValue,
    weekLabel,
} from "../lib/format";

const KPIS = [
    {
        key: "registrations",
        name: "New registrations",
        category: "Acquisition",
        tooltip:
            "Count of new user accounts created during the week. Source: D1 database (user.created_at)",
    },
    {
        key: "activations",
        name: "Activated (D7)",
        category: "Acquisition",
        tooltip:
            "Users who made at least one API request within 7 days of registration. Source: D1 + Tinybird (generation_event_v2)",
    },
    {
        key: "activationRate",
        name: "D7 activation rate",
        category: "Acquisition",
        format: "percent",
        calc: (w) => (w.activations / w.registrations) * 100,
        tooltip:
            "Activated users / new registrations × 100. What share of signups become real users within 7 days.",
    },
    {
        key: "wau",
        name: "WAU",
        category: "Usage",
        tooltip:
            "Weekly active users: unique users with at least one API request this week. Source: Tinybird (generation_event_v2)",
    },
    {
        key: "tokens",
        category: "Usage",
        format: "compact",
        views: [
            {
                name: "Total tokens",
                tooltip:
                    "Sum of prompt + completion tokens consumed. Source: Tinybird (weekly_usage_stats)",
            },
            {
                name: "Tokens/user",
                calc: (w) => w.tokens / w.wau,
                tooltip:
                    "Total tokens / WAU. Usage depth — how much each active user consumes on average.",
            },
        ],
    },
    {
        key: "revenue",
        category: "Revenue",
        format: "currency",
        views: [
            {
                name: "Revenue",
                tooltip:
                    "Gross USD from Pollen pack purchases. Source: Stripe checkout events in Tinybird.",
            },
            {
                name: "ARPA",
                calc: (w) => w.revenue / w.wau,
                tooltip:
                    "Weekly revenue / WAU. Average revenue per active user — monetization efficiency.",
            },
        ],
    },
    {
        key: "packPurchases",
        category: "Revenue",
        views: [
            {
                name: "Pack purchases",
                tooltip:
                    "Completed Pollen pack purchases this week. Source: Stripe checkout events in Tinybird.",
            },
            {
                name: "Purchase rate",
                format: "percent",
                calc: (w) => (w.packPurchases / w.wau) * 100,
                tooltip:
                    "Pack purchases / WAU × 100. Share of active users who bought a pack this week.",
            },
        ],
    },
    {
        key: "grossMargin",
        name: "Gross margin",
        category: "Efficiency",
        format: "percent",
        calc: (w) =>
            w.revenue > 0
                ? ((w.revenue - (w.costUsd || 0)) / w.revenue) * 100
                : null,
        tooltip:
            "(Revenue − COGS) / revenue × 100. COGS is compute cost from generation_event_v2.total_cost (GPU, tokens, providers).",
    },
    {
        key: "availability",
        name: "Service availability",
        category: "Health",
        format: "percent",
        tooltip:
            "(Total − 5xx) / total × 100. User errors (4xx) do not count as downtime.",
    },
    {
        key: "byopUserPct",
        name: "BYOP user %",
        category: "Segments",
        format: "percent",
        tooltip:
            "Share of active users from BYOP apps (app key attribution or hostname heuristic).",
    },
    {
        key: "byopPollenPct",
        name: "BYOP Pollen %",
        category: "Segments",
        format: "percent",
        tooltip:
            "Share of Pollen consumed by apps that bring their own Pollen.",
    },
    {
        key: "appSubmissions",
        name: "App submissions",
        category: "Community",
        tooltip:
            "Issues opened this week with the APP-SUBMISSION label on pollinations/pollinations.",
    },
];

function kpiValue(kpi, week) {
    return kpi.calc ? kpi.calc(week) : week[kpi.key];
}

export function KPITrendTable({ weeklyData }) {
    // Some rows are the same measure in another unit — tokens/user tracks total
    // tokens at r = +0.996 while WAU stays flat — so they share one row and
    // cycle on click instead of each taking a line of their own.
    const [viewIndex, setViewIndex] = useState({});
    const partialWeekStart = currentWeekStart();
    const partialWeek = weeklyData.find((w) => w.week === partialWeekStart);
    const fullWeeks = weeklyData.filter((w) => w.week !== partialWeekStart);
    const lastFull = fullWeeks[fullWeeks.length - 1];
    const previousFull = fullWeeks[fullWeeks.length - 2];
    const displayWeeks = [...fullWeeks].reverse();

    return (
        <Surface className="flex flex-col gap-3">
            <Heading as="h3" size="card">
                KPI trend
            </Heading>
            <div className="-mx-4 min-w-0 overflow-x-auto px-4">
                <Table className="text-xs">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="sticky left-0 z-10 min-w-40 bg-surface-opaque">
                                KPI
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className="bg-theme-bg-subtle"
                            >
                                Now
                                <Text
                                    as="span"
                                    size="micro"
                                    tone="muted"
                                    className="block font-normal"
                                >
                                    {weekLabel(partialWeek?.week)}
                                </Text>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">WoW</TableHeaderCell>
                            {displayWeeks.map((week) => (
                                <TableHeaderCell key={week.week} align="right">
                                    {weekLabel(week.week)}
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {KPIS.map((row) => {
                            const views = row.views;
                            const index = viewIndex[row.key] ?? 0;
                            const kpi = views
                                ? { ...row, ...views[index % views.length] }
                                : row;
                            const change = calcChange(
                                lastFull ? kpiValue(kpi, lastFull) : null,
                                previousFull
                                    ? kpiValue(kpi, previousFull)
                                    : null,
                            );
                            const tone =
                                change == null || Math.abs(change) <= 5
                                    ? "text-theme-text-muted"
                                    : change > 0
                                      ? "text-intent-success-text"
                                      : "text-intent-danger-text";
                            return (
                                <TableRow key={row.key}>
                                    <TableCell className="sticky left-0 z-10 bg-surface-opaque">
                                        <span className="flex items-center font-medium text-theme-text-strong">
                                            {views ? (
                                                <button
                                                    type="button"
                                                    title={`Show ${views[(index + 1) % views.length].name}`}
                                                    onClick={() =>
                                                        setViewIndex(
                                                            (prev) => ({
                                                                ...prev,
                                                                [row.key]:
                                                                    index + 1,
                                                            }),
                                                        )
                                                    }
                                                    className="flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-theme-text-link"
                                                >
                                                    {kpi.name}
                                                    <span aria-hidden="true">
                                                        ⇄
                                                    </span>
                                                </button>
                                            ) : (
                                                kpi.name
                                            )}
                                            <InfoTip text={kpi.tooltip} />
                                        </span>
                                        <Text
                                            as="span"
                                            size="micro"
                                            tone="muted"
                                        >
                                            {kpi.category}
                                        </Text>
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="bg-theme-bg-subtle font-semibold text-theme-text-strong"
                                    >
                                        {formatValue(
                                            partialWeek
                                                ? kpiValue(kpi, partialWeek)
                                                : null,
                                            kpi.format,
                                        )}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={tone}
                                    >
                                        {change == null
                                            ? "—"
                                            : `${change > 0 ? "▲" : change < 0 ? "▼" : "→"} ${Math.round(change)}%`}
                                    </TableCell>
                                    {displayWeeks.map((week) => (
                                        <TableCell
                                            key={week.week}
                                            align="right"
                                            numeric
                                            muted
                                        >
                                            {formatValue(
                                                kpiValue(kpi, week),
                                                kpi.format,
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            <Text as="p" size="micro" tone="muted">
                Now = current partial week · WoW = last two full weeks ·{" "}
                {displayWeeks.length} full weeks shown
            </Text>
        </Surface>
    );
}
