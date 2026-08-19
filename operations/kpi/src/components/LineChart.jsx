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
 * Weekly line chart. One measure family per chart — a second y-scale would
 * make the crossing point meaningless, so unrelated measures get their own
 * chart instead.
 */
export function LineChart({ title, data, series, format = "number" }) {
    const [ref, width] = useElementWidth();
    const [hover, setHover] = useState(null);

    const points = data.filter((row) => row.week);
    const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;

    const { lo, hi, ticks } = niceScale(
        points.flatMap((row) =>
            series
                .map((s) => row[s.key])
                .filter((value) => Number.isFinite(value)),
        ),
    );

    const xAt = (index) =>
        PAD.left +
        (points.length > 1
            ? (plotWidth * index) / (points.length - 1)
            : plotWidth / 2);
    const yAt = (value) =>
        PAD.top + plotHeight - ((value - lo) / (hi - lo)) * plotHeight;

    const pathFor = (key) => {
        let path = "";
        let pendingMove = true;
        points.forEach((row, index) => {
            const value = row[key];
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
        .map((s, seriesIndex) => {
            for (let index = points.length - 1; index >= 0; index--) {
                const value = points[index][s.key];
                if (Number.isFinite(value))
                    return { key: s.key, seriesIndex, value, y: yAt(value) };
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
                    {series.map((s, index) => (
                        <span
                            key={s.key}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden="true"
                                className="h-2 w-2 rounded-[2px]"
                                style={{ background: SERIES_COLORS[index] }}
                            />
                            <Text as="span" size="xs" tone="muted">
                                {s.label}
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
                        aria-label={`${title}: ${series.map((s) => s.label).join(", ")} by week`}
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
                                    {formatValue(
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

                        {series.map((s, index) => (
                            <path
                                key={s.key}
                                d={pathFor(s.key)}
                                fill="none"
                                stroke={SERIES_COLORS[index]}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}

                        {series.map((s, index) =>
                            points.map((row, pointIndex) =>
                                Number.isFinite(row[s.key]) ? (
                                    <circle
                                        key={`${s.key}-${row.week}`}
                                        cx={xAt(pointIndex)}
                                        cy={yAt(row[s.key])}
                                        r={hover === pointIndex ? 4 : 2.5}
                                        fill={SERIES_COLORS[index]}
                                        className="stroke-surface-opaque"
                                        strokeWidth={
                                            hover === pointIndex ? 2 : 0
                                        }
                                    />
                                ) : null,
                            ),
                        )}

                        {endLabels.map((label) => (
                            <text
                                key={label.key}
                                x={PAD.left + plotWidth + 8}
                                y={label.y + 3}
                                className="fill-theme-text-base text-[10px] font-semibold tabular-nums"
                            >
                                {formatValue(label.value, format)}
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
                                Math.max(width - 130, 0),
                            ),
                        }}
                    >
                        <Text as="div" size="micro" tone="muted" weight="bold">
                            {weekLabel(points[hover].week)}
                        </Text>
                        {series.map((s, index) => (
                            <div
                                key={s.key}
                                className="flex items-center gap-1.5 whitespace-nowrap"
                            >
                                <span
                                    aria-hidden="true"
                                    className="h-2 w-2 shrink-0 rounded-[2px]"
                                    style={{ background: SERIES_COLORS[index] }}
                                />
                                <Text as="span" size="xs" tone="muted">
                                    {s.label}
                                </Text>
                                <Text
                                    as="span"
                                    size="xs"
                                    tone="strong"
                                    weight="semibold"
                                    className="ml-auto tabular-nums"
                                >
                                    {formatValue(points[hover][s.key], format)}
                                </Text>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {lo > 0 && (
                <Text as="p" size="micro" tone="muted">
                    Axis starts at {formatValue(lo, format)}, not zero.
                </Text>
            )}
        </Surface>
    );
}
