import { KPIS, kpiValue, kpiView } from "../lib/kpis";
import { LineChart } from "./LineChart";

/**
 * Plots whichever KPI row the reader picked — from the selector here, or from
 * the graph button on a table row. Rows that cycle through units follow the
 * unit the table is currently showing.
 */
export function KpiExplorer({ id, weeks, selected, viewIndex, onSelect }) {
    const row = KPIS.find((item) => item.key === selected) ?? KPIS[0];
    const kpi = kpiView(row, viewIndex[row.key] ?? 0);

    // Pipes reach back different distances, so trim to the span this metric
    // actually covers instead of leaving a long empty run-up.
    const points = weeks.map((week) => ({
        week: week.week,
        value: kpiValue(kpi, week),
    }));
    const first = points.findIndex((point) => Number.isFinite(point.value));
    const last = points.findLastIndex((point) => Number.isFinite(point.value));
    const data = first === -1 ? [] : points.slice(first, last + 1);

    const selector = (
        <select
            aria-label="KPI to graph"
            value={row.key}
            onChange={(event) => onSelect(event.target.value)}
            className="rounded-lg bg-theme-bg-subtle px-2.5 py-1.5 font-medium text-sm text-theme-text-strong hover:bg-theme-bg-hover"
        >
            {KPIS.map((item) => (
                <option key={item.key} value={item.key}>
                    {kpiView(item, viewIndex[item.key] ?? 0).name}
                </option>
            ))}
        </select>
    );

    return (
        <div id={id}>
            <LineChart
                title="Graph any KPI"
                data={data}
                series={[{ key: "value", label: kpi.name }]}
                format={kpi.format}
                action={selector}
            />
        </div>
    );
}
