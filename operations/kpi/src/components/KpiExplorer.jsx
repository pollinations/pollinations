import { KPI_VIEWS, kpiValue, kpiViewById } from "../lib/kpis";
import { LineChart } from "./LineChart";

/**
 * Plots whichever KPI the reader picked — from the selector here, or from the
 * graph button on a table row. Rows that cycle through units contribute one
 * entry per unit, so every variant is selectable without touching the table.
 */
export function KpiExplorer({ id, weeks, selected, onSelect }) {
    const kpi = kpiViewById(selected);

    // Pipes reach back different distances, so trim to the span this metric
    // actually covers instead of leaving a long empty run-up.
    const points = weeks.map((week) => ({
        week: week.week,
        value: kpiValue(kpi, week),
    }));
    const first = points.findIndex((point) => Number.isFinite(point.value));
    const last = points.findLastIndex((point) => Number.isFinite(point.value));
    const data = first === -1 ? [] : points.slice(first, last + 1);

    // Categories keep a ~19-entry list readable, in catalogue order.
    const categories = [...new Set(KPI_VIEWS.map((view) => view.category))];

    const selector = (
        <select
            aria-label="KPI to graph"
            value={kpi.id}
            onChange={(event) => onSelect(event.target.value)}
            className="rounded-lg bg-theme-bg-subtle px-2.5 py-1.5 font-medium text-sm text-theme-text-strong hover:bg-theme-bg-hover"
        >
            {categories.map((category) => (
                <optgroup key={category} label={category}>
                    {KPI_VIEWS.filter((view) => view.category === category).map(
                        (view) => (
                            <option key={view.id} value={view.id}>
                                {view.name}
                            </option>
                        ),
                    )}
                </optgroup>
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
