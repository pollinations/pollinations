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
const DUAL_PAD = { top: 16, right: 56, bottom: 28, left: 52 };
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

const LADDER = [1, 2, 2.5, 5, 10];

/** Snap a step to 1/2/2.5/5/10 × 10^n so ticks land on read-off values. */
function niceStep(span) {
    if (!(span > 0)) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(span));
    const normalized = span / magnitude;
    return LADDER.find((rung) => normalized <= rung) * magnitude;
}

/**
 * The ladder rung nearest a target step, rather than the next one up. Rounding
 * up always would cost gridlines: a span wanting 240K would jump to 500K and
 * leave the plot with two lines on it.
 */
const LADDER_EDGES = [1.5, 2.25, 3.55, 7.1];
function nearestStep(span) {
    if (!(span > 0)) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(span));
    const normalized = span / magnitude;
    const rung = LADDER_EDGES.findIndex((edge) => normalized < edge);
    return LADDER[rung === -1 ? LADDER.length - 1 : rung] * magnitude;
}

/** The next step up the ladder. */
function widerStep(step) {
    const magnitude = 10 ** Math.floor(Math.log10(step));
    const normalized = step / magnitude;
    const next = LADDER.find((rung) => rung > normalized * 1.001) ?? 10;
    return next * magnitude;
}

/** The window the data occupies, with a little air above and below. */
function dataWindow(values) {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || Math.abs(rawMax) || 1;
    const min = rawMin - span * 0.08;
    return {
        // Air below, but a series that never goes negative keeps a floor of
        // zero rather than dipping into it. Gross margin does go negative.
        min: rawMin >= 0 ? Math.max(0, min) : min,
        max: rawMax + span * 0.08,
    };
}

/**
 * Fit the axis to the data rather than to zero — twelve weeks of WAU sitting
 * between 6k and 7k is a flat line on a zero baseline.
 *
 * The bounds are the data window itself, and the ticks are the round numbers
 * that fall inside it. Snapping the bounds outward to round numbers instead is
 * what strands half the plot: a series topping out at 1.24M gets rounded up to
 * a 2.5M ceiling and then draws in the bottom half of the card.
 */
function niceScale(values) {
    if (values.length === 0) return { lo: 0, hi: 1, ticks: [0, 1] };
    const { min, max } = dataWindow(values);
    const step = nearestStep((max - min) / TICKS);
    const ticks = [];
    for (
        let tick = Math.ceil(min / step) * step;
        tick <= max + step * 1e-9;
        tick += step
    )
        ticks.push(tick);
    return { lo: min, hi: max, step, ticks };
}

/**
 * Same idea, but every axis gets exactly TICKS intervals starting on a round
 * number, so two scales on one plot put their labels on shared gridlines.
 * Only the dual-axis chart needs this; it trades some fit for that alignment.
 */
function alignedScale(values) {
    if (values.length === 0) return { lo: 0, hi: 1, ticks: [0, 1] };
    const { min, max } = dataWindow(values);
    let step = niceStep((max - min) / TICKS);
    const floorAt = (size) => {
        const value = Math.floor(min / size) * size;
        return min >= 0 ? Math.max(0, value) : value;
    };
    let lo = floorAt(step);
    while (lo + step * TICKS < max) {
        step = widerStep(step);
        lo = floorAt(step);
    }
    const ticks = Array.from({ length: TICKS + 1 }, (_, i) => lo + step * i);
    return { lo, hi: lo + step * TICKS, step, ticks };
}

/**
 * Weekly line chart.
 *
 * `dualAxis` gives the two series their own y-scale — first series on the left
 * axis, second on the right. Read each line against its own axis: the two
 * scales are independent, so where the lines cross carries no meaning.
 */
export function LineChart({
    title,
    data,
    series,
    format = "number",
    dualAxis = false,
    action,
}) {
    const [ref, width] = useElementWidth();
    const [hover, setHover] = useState(null);

    const dual = dualAxis && series.length === 2;
    const pad = dual ? DUAL_PAD : PAD;
    const points = data.filter((row) => row.week);
    const plotWidth = Math.max(width - pad.left - pad.right, 10);
    const plotHeight = HEIGHT - pad.top - pad.bottom;

    const formatOf = (item) => item.format ?? format;
    const valuesOf = (item) =>
        points.map((row) => row[item.key]).filter(Number.isFinite);

    // One scale per axis. Both end up with TICKS intervals, so the right-hand
    // labels land on the same gridlines as the left-hand ones.
    const scales = dual
        ? series.map((item) => alignedScale(valuesOf(item)))
        : [niceScale(series.flatMap(valuesOf))];
    const scaleOf = (index) => scales[dual ? index : 0];

    const xAt = (index) =>
        pad.left +
        (points.length > 1
            ? (plotWidth * index) / (points.length - 1)
            : plotWidth / 2);
    const yAt = (value, seriesIndex = 0) => {
        const { lo, hi } = scaleOf(seriesIndex);
        return pad.top + plotHeight - ((value - lo) / (hi - lo)) * plotHeight;
    };

    const pathFor = (item, seriesIndex) => {
        let path = "";
        let pendingMove = true;
        points.forEach((row, index) => {
            const value = row[item.key];
            if (!Number.isFinite(value)) {
                pendingMove = true;
                return;
            }
            path += `${pendingMove ? "M" : "L"}${xAt(index)},${yAt(value, seriesIndex)}`;
            pendingMove = false;
        });
        return path;
    };

    // Last known value per series, nudged apart so the end labels never stack.
    // With two axes the right edge belongs to the second axis, so they go.
    const endLabels = dual
        ? []
        : series
              .map((item) => {
                  for (let index = points.length - 1; index >= 0; index--) {
                      const value = points[index][item.key];
                      if (Number.isFinite(value))
                          return {
                              key: item.key,
                              label: formatValue(value, formatOf(item)),
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

    // Axis ticks wear the format of the series they belong to. Percentages get
    // as many decimals as the step needs — availability sits between 99% and
    // 100%, and whole-number ticks there would all read the same.
    const axisLabel = (tick, seriesIndex) => {
        const scale = scaleOf(seriesIndex);
        const tickFormat = dual ? formatOf(series[seriesIndex]) : format;
        if (
            tickFormat === "percent" ||
            tickFormat === "percentPrecise" ||
            tickFormat === "perThousand"
        ) {
            const decimals = scale.step >= 1 ? 0 : scale.step >= 0.1 ? 1 : 2;
            const suffix = tickFormat === "perThousand" ? " / 1K" : "%";
            return `${tick.toFixed(decimals)}${suffix}`;
        }
        return formatValue(
            tick,
            tickFormat === "currency" ? "currency" : "compact",
        );
    };

    const xLabelStep = Math.ceil(points.length / 6);

    return (
        <Surface className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Heading as="h3" size="card">
                    {title}
                </Heading>
                {action}
            </div>

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
                                {dual && (index === 0 ? " (left)" : " (right)")}
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
                                (x - pad.left) / Math.max(plotWidth, 1);
                            const index = Math.round(
                                ratio * Math.max(points.length - 1, 1),
                            );
                            setHover(
                                Math.min(Math.max(index, 0), points.length - 1),
                            );
                        }}
                    >
                        <title>{title}</title>
                        {scales[0].ticks.map((tick, tickIndex) => (
                            <g key={tick}>
                                <line
                                    x1={pad.left}
                                    x2={pad.left + plotWidth}
                                    y1={yAt(tick)}
                                    y2={yAt(tick)}
                                    className="stroke-divider"
                                    strokeWidth={1}
                                />
                                <text
                                    x={pad.left - 8}
                                    y={yAt(tick) + 3}
                                    textAnchor="end"
                                    className="fill-theme-text-muted text-[10px] tabular-nums"
                                >
                                    {axisLabel(tick, 0)}
                                </text>
                                {dual && (
                                    <text
                                        x={pad.left + plotWidth + 8}
                                        y={yAt(tick) + 3}
                                        className="fill-theme-text-muted text-[10px] tabular-nums"
                                    >
                                        {axisLabel(
                                            scales[1].ticks[tickIndex],
                                            1,
                                        )}
                                    </text>
                                )}
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
                                y1={pad.top}
                                y2={pad.top + plotHeight}
                                className="stroke-theme-text-muted"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                            />
                        )}

                        {series.map((item, index) => (
                            <path
                                key={item.key}
                                d={pathFor(item, index)}
                                fill="none"
                                stroke={SERIES_COLORS[index]}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}

                        {series.map((item, index) =>
                            points.map((row, pointIndex) => {
                                const value = row[item.key];
                                return Number.isFinite(value) ? (
                                    <circle
                                        key={`${item.key}-${row.week}`}
                                        cx={xAt(pointIndex)}
                                        cy={yAt(value, index)}
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
                                x={pad.left + plotWidth + 8}
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

            {dual ? (
                <Text as="p" size="micro" tone="muted">
                    Two scales: {series[0].label} on the left axis,{" "}
                    {series[1].label} on the right. Read each line against its
                    own axis — where they cross means nothing.
                </Text>
            ) : (
                scales[0].lo > 0 && (
                    <Text as="p" size="micro" tone="muted">
                        Axis starts at {axisLabel(scales[0].lo, 0)}, not zero.
                    </Text>
                )
            )}
        </Surface>
    );
}
