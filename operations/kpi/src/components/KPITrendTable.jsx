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
import {
    calcChange,
    currentWeekStart,
    formatValue,
    weekLabel,
} from "../lib/format";
import { KPIS, kpiValue, kpiView, kpiViewId } from "../lib/kpis";

/** Three rising bars — marks the row you can send to the explorer chart. */
function ChartIcon() {
    return (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <title>Graph</title>
            <rect x="1" y="7" width="2.5" height="4" fill="currentColor" />
            <rect x="4.75" y="4" width="2.5" height="7" fill="currentColor" />
            <rect x="8.5" y="1" width="2.5" height="10" fill="currentColor" />
        </svg>
    );
}

export function KPITrendTable({ weeklyData, viewIndex, onCycle, onGraph }) {
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
                            {displayWeeks.map((week, weekIndex) => (
                                <TableHeaderCell
                                    key={week.week}
                                    align="right"
                                    className={
                                        weekIndex === 0 ? "min-w-24" : undefined
                                    }
                                >
                                    {weekLabel(week.week)}
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {KPIS.map((row) => {
                            const views = row.views;
                            const index = viewIndex[row.key] ?? 0;
                            const kpi = kpiView(row, index);
                            const change = calcChange(
                                lastFull ? kpiValue(kpi, lastFull) : null,
                                previousFull
                                    ? kpiValue(kpi, previousFull)
                                    : null,
                            );
                            const improving = kpi.lowerIsBetter
                                ? change < 0
                                : change > 0;
                            const tone =
                                change == null || Math.abs(change) <= 5
                                    ? "text-theme-text-muted"
                                    : improving
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
                                                        onCycle(row.key)
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
                                            <button
                                                type="button"
                                                aria-label={`Graph ${kpi.name}`}
                                                title={`Graph ${kpi.name}`}
                                                onClick={() =>
                                                    onGraph(
                                                        kpiViewId(row, index),
                                                    )
                                                }
                                                className="ml-1 text-theme-text-muted hover:text-theme-text-link"
                                            >
                                                <ChartIcon />
                                            </button>
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
                                    {displayWeeks.map((week, weekIndex) => (
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
                                            {weekIndex === 0 &&
                                                change != null && (
                                                    <span
                                                        className={`ml-1.5 text-[10px] ${tone}`}
                                                        title={`vs ${weekLabel(previousFull?.week)}`}
                                                    >
                                                        {change > 0
                                                            ? "▲"
                                                            : change < 0
                                                              ? "▼"
                                                              : "→"}
                                                        {Math.round(
                                                            Math.abs(change),
                                                        )}
                                                        %
                                                    </span>
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
                Now = current partial week · the % on{" "}
                {weekLabel(lastFull?.week)} is its change from{" "}
                {weekLabel(previousFull?.week)} · {displayWeeks.length} full
                weeks shown
            </Text>
        </Surface>
    );
}
