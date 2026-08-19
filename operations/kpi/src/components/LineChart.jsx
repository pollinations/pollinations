import { Heading, Surface, Text } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { formatValue, weekLabel } from "../lib/format";

const SERIES_COLORS = [
    "var(--kpi-series-1)",
    "var(--kpi-series-2)",
    "var(--kpi-series-3)",
];

const HEIGHT = 320;
const PAD = { top: 16, right: 62, bottom: 28, left: 52 };
const TICKS = 5;

function useElementWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width),
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

/** Snap a step to 1/2/5 × 10^n so ticks land on read-off values. */
function niceStep(span) {
    if (!(span > 0)) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(span));
    const normalized = span / magnitude;
    const step =
        normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
}

/**
 * Fit the axis to the data rather than to zero — twelve weeks of WAU sitting
 * between 6k and 7k is a flat line on a zero baseline. The floor is clamped at
 * zero so a series that genuinely reaches it still reads as reaching it, and
 * the bottom tick is always labelled.
 */
function niceScale(values) {
    if (values.length === 0) return { lo: 0, hi: 1, ticks: [0, 1] };
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || Math.abs(rawMax) || 1;
    const step = niceStep((span * 1.16) / TICKS);
    const lo = Math.max(0, Math.floor((rawMin - span * 0.08) / step) * step);
    const hi = Math.ceil((rawMax + span * 0.08) / step) * step;
    const ticks = [];
    for (let tick = lo; tick <= hi + step / 2; tick += step) ticks.push(tick);
    return { lo, hi, ticks };
}

/**
 * Weekly line chart.
 *
 * Measures of different magnitude go on one axis by being indexed to 100 at the
 * first week (`indexed`), never by growing a second y-scale: with two scales the
 * lines cross wherever the axes are rescaled, so the crossing means nothing.
 * Indexed, the shapes are genuinely comparable and the tooltip and end labels
 * still carry the real numbers.
 */
export function LineChart({
    title,
    data,
    series,
    format = "number",
    indexed = false,
}) {
    const [ref, width] = useElementWidth();
    const [hover, setHover] = useState(null);

    const points = data.filter((row) => row.week);
    const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;

    const formatOf = (item) => item.format ?? format;

    // One shared base week for every series — indexing each to its own first
    // reading would compare growth measured from different starting points.
    const baseIndex = points.findIndex((row) =>
        series.every((item) => Number.isFinite(row[item.key])),
    );
    const baseRow = baseIndex === -1 ? null : points[baseIndex];

    // What actually gets drawn: the raw value, or its percentage of the base
    // week when the chart is indexed.
    const plotted = (item, row) => {
        const value = row[item.key];
        if (!Number.isFinite(value)) return null;
        if (!indexed) return value;
        const base = baseRow?.[item.key];
        return base ? (value / base) * 100 : null;
    };

    const { lo, hi, ticks } = niceScale(
        points.flatMap((row) =>
            series.map((item) => plotted(item, row)).filter(Number.isFinite),
        ),
    );

    const xAt = (index) =>
        PAD.left +
        (points.length > 1
            ? (plotWidth * index) / (points.length - 1)
            : plotWidth / 2);
    const yAt = (value) =>
        PAD.top + plotHeight - ((value - lo) / (hi - lo)) * plotHeight;

    const pathFor = (item) => {
        let path = "";
        let pendingMove = true;
        points.forEach((row, index) => {
            const value = plotted(item, row);
            if (!Number.isFinite(value)) {
                pendingMove = true;
                return;
            }
            path += `${pendingMove ? "M" : "L"}${xAt(index)},${yAt(value)}`;
            pendingMove = false;
        });
        return path;
    };

    // Last known value per series, nudged apart so the end labels never stack.
    const endLabels = series
        .map((item) => {
            for (let index = points.length - 1; index >= 0; index--) {
                const value = plotted(item, points[index]);
                if (Number.isFinite(value))
                    return {
                        key: item.key,
                        label: formatValue(
                            points[index][item.key],
                            formatOf(item),
                        ),
                        y: yAt(value),
                    };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.y - b.y);
    endLabels.forEach((label, index) => {
        const previous = endLabels[index - 1];
        if (previous && label.y - previous.y < 13) label.y = previous.y + 13;
    });

    const xLabelStep = Math.ceil(points.length / 6);

    return (
        <Surface className="flex flex-col gap-3">
            <Heading as="h3" size="card">
                {title}
            </Heading>

            {series.length > 1 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {series.map((item, index) => (
                        <span
                            key={item.key}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden="true"
                                className="h-2 w-2 rounded-[2px]"
                                style={{ background: SERIES_COLORS[index] }}
                            />
                            <Text as="span" size="xs" tone="muted">
                                {item.label}
                            </Text>
                        </span>
                    ))}
                </div>
            )}

            <div ref={ref} className="relative">
                {width > 0 && (
                    <svg
                        width={width}
                        height={HEIGHT}
                        role="img"
                        aria-label={`${title}: ${series.map((item) => item.label).join(", ")} by week`}
                        onPointerLeave={() => setHover(null)}
                        onPointerMove={(event) => {
                            const bounds =
                                event.currentTarget.getBoundingClientRect();
                            const x = event.clientX - bounds.left;
                            const ratio =
                                (x - PAD.left) / Math.max(plotWidth, 1);
                            const index = Math.round(
                                ratio * Math.max(points.length - 1, 1),
                            );
                            setHover(
                                Math.min(Math.max(index, 0), points.length - 1),
                            );
                        }}
                    >
                        <title>{title}</title>
                        {ticks.map((tick) => (
                            <g key={tick}>
                                <line
                                    x1={PAD.left}
                                    x2={PAD.left + plotWidth}
                                    y1={yAt(tick)}
                                    y2={yAt(tick)}
                                    className="stroke-divider"
                                    strokeWidth={1}
                                />
                                <text
                                    x={PAD.left - 8}
                                    y={yAt(tick) + 3}
                                    textAnchor="end"
                                    className="fill-theme-text-muted text-[10px] tabular-nums"
                                >
                                    {indexed
                                        ? Math.round(tick)
                                        : formatValue(
                                              tick,
                                              format === "currency"
                                                  ? "currency"
                                                  : "compact",
                                          )}
                                </text>
                            </g>
                        ))}

                        {points.map((row, index) =>
                            index % xLabelStep === 0 ? (
                                <text
                                    key={row.week}
                                    x={xAt(index)}
                                    y={HEIGHT - 8}
                                    textAnchor="middle"
                                    className="fill-theme-text-muted text-[10px] tabular-nums"
                                >
                                    {weekLabel(row.week)}
                                </text>
                            ) : null,
                        )}

                        {hover != null && (
                            <line
                                x1={xAt(hover)}
                                x2={xAt(hover)}
                                y1={PAD.top}
                                y2={PAD.top + plotHeight}
                                className="stroke-theme-text-muted"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                            />
                        )}

                        {series.map((item, index) => (
                            <path
                                key={item.key}
                                d={pathFor(item)}
                                fill="none"
                                stroke={SERIES_COLORS[index]}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}

                        {series.map((item, index) =>
                            points.map((row, pointIndex) => {
                                const value = plotted(item, row);
                                return Number.isFinite(value) ? (
                                    <circle
                                        key={`${item.key}-${row.week}`}
                                        cx={xAt(pointIndex)}
                                        cy={yAt(value)}
                                        r={hover === pointIndex ? 4 : 2.5}
                                        fill={SERIES_COLORS[index]}
                                        className="stroke-surface-opaque"
                                        strokeWidth={
                                            hover === pointIndex ? 2 : 0
                                        }
                                    />
                                ) : null;
                            }),
                        )}

                        {endLabels.map((label) => (
                            <text
                                key={label.key}
                                x={PAD.left + plotWidth + 8}
                                y={label.y + 3}
                                className="fill-theme-text-base text-[10px] font-semibold tabular-nums"
                            >
                                {label.label}
                            </text>
                        ))}
                    </svg>
                )}

                {hover != null && points[hover] && (
                    <div
                        className="pointer-events-none absolute top-2 z-10 rounded-lg bg-theme-bg-pale px-2 py-1.5 shadow-well"
                        style={{
                            left: Math.min(
                                Math.max(xAt(hover) - 60, 0),
                                Math.max(width - 140, 0),
                            ),
                        }}
                    >
                        <Text as="div" size="micro" tone="muted" weight="bold">
                            {weekLabel(points[hover].week)}
                        </Text>
                        {series.map((item, index) => (
                            <div
                                key={item.key}
                                className="flex items-center gap-1.5 whitespace-nowrap"
                            >
                                <span
                                    aria-hidden="true"
                                    className="h-2 w-2 shrink-0 rounded-[2px]"
                                    style={{ background: SERIES_COLORS[index] }}
                                />
                                <Text as="span" size="xs" tone="muted">
                                    {item.label}
                                </Text>
                                <Text
                                    as="span"
                                    size="xs"
                                    tone="strong"
                                    weight="semibold"
                                    className="ml-auto tabular-nums"
                                >
                                    {formatValue(
                                        points[hover][item.key],
                                        formatOf(item),
                                    )}
                                </Text>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {indexed ? (
                <Text as="p" size="micro" tone="muted">
                    Each series indexed to 100 at {weekLabel(baseRow?.week)}.
                    Hover for actual values.
                </Text>
            ) : (
                lo > 0 && (
                    <Text as="p" size="micro" tone="muted">
                        Axis starts at {formatValue(lo, format)}, not zero.
                    </Text>
                )
            )}
        </Surface>
    );
}
