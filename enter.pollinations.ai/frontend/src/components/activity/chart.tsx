import {
    PAID_BALANCE_CHART_COLOR,
    TIER_BALANCE_CHART_COLOR,
} from "@pollinations/ui/wallet";
import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ACTIVITY_MIN_DATE,
    type ActivityPeriod,
    activityBucketKey,
} from "./activity-period";
import { formatActivityPollen } from "./format-activity-pollen";
import type { DataPoint, Metric } from "./types";

const CHART_COLORS = {
    // Neutral separator line — the purpose-built mode-aware token. ink-200 was
    // invisible in dark (0.255 < app-bg 0.265) and in light (0.928 = app-bg).
    grid: "var(--polli-color-divider)",
} as const;

type ChartProps = {
    data: DataPoint[];
    metric: Metric;
    label: string;
    period: ActivityPeriod;
    onSelect: (point: DataPoint) => void;
    onClearSelection: () => void;
};

function getYAxisPadding({
    isCompact,
    needsPrecisePollenScale,
}: {
    isCompact: boolean;
    needsPrecisePollenScale: boolean;
}): number {
    if (needsPrecisePollenScale) return isCompact ? 58 : 68;
    return isCompact ? 36 : 55;
}

export const Chart: FC<ChartProps> = ({
    data,
    metric,
    label,
    onSelect,
    onClearSelection,
    period,
}) => {
    const now = new Date();
    const canSelect = (point: DataPoint) =>
        point.timestamp >= ACTIVITY_MIN_DATE && point.timestamp <= now;
    const [animationProgress, setAnimationProgress] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(600);

    // Animate on mount with cleanup to prevent memory leaks
    useEffect(() => {
        let animationId: number;
        const duration = 800;
        const start = performance.now();
        const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            setAnimationProgress(1 - (1 - progress) ** 3);
            if (progress < 1) animationId = requestAnimationFrame(animate);
        };
        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, []);

    // Responsive — track both window resize and container resize. Window-only
    // listening misses cases where the container reflows (e.g. content above
    // loads in and pushes/squeezes this chart) without the window changing size.
    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const update = () => setWidth(node.offsetWidth);
        update();
        window.addEventListener("resize", update);
        const ro = new ResizeObserver(update);
        ro.observe(node);
        return () => {
            window.removeEventListener("resize", update);
            ro.disconnect();
        };
    }, []);

    const height = 180;
    const isCompact = width < 480;
    const maxDataValue =
        data.length > 0 ? Math.max(...data.map((d) => d.value)) : 0;
    const needsPrecisePollenScale =
        metric === "pollen" && maxDataValue > 0 && maxDataValue < 0.0001;
    const pad = {
        top: 24,
        right: isCompact ? 10 : 20,
        bottom: 32,
        left: getYAxisPadding({ isCompact, needsPrecisePollenScale }),
    };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const { bars, yTicks } = useMemo(() => {
        if (data.length === 0) return { bars: [], yTicks: [] };

        const max = maxDataValue;

        // Calculate nice tick spacing based on data max
        const getNiceStep = (maxVal: number): number => {
            if (maxVal <= 0) return 1;
            const magnitude = 10 ** Math.floor(Math.log10(maxVal));
            const normalized = maxVal / magnitude;
            // Pick step that gives 4-6 ticks and uses range well
            // For normalized values (1-10), pick step that results in max being 60-100% of scale
            if (normalized <= 1.2) return magnitude * 0.2;
            if (normalized <= 1.5) return magnitude * 0.5;
            if (normalized <= 2.5) return magnitude * 0.5;
            if (normalized <= 3.5) return magnitude;
            if (normalized <= 6) return magnitude;
            if (normalized <= 8) return magnitude * 2;
            return magnitude * 2;
        };

        // Calculate nice scale with tight fit
        const tickSpacing = getNiceStep(max || 1);
        // Round up to next tick, then add just one more tick for headroom
        const niceMaxVal =
            Math.ceil(max / tickSpacing) * tickSpacing || tickSpacing;

        const barWidth = Math.max(4, (cw / data.length) * 0.7);
        const gap = (cw / data.length) * 0.3;

        const barData = data.map((d, i) => {
            const tierHeight = (d.tierValue / niceMaxVal) * ch;
            const paidHeight = (d.paidValue / niceMaxVal) * ch;
            return {
                x: pad.left + i * (barWidth + gap) + gap / 2,
                y: pad.top + ch - (d.value / niceMaxVal) * ch,
                width: barWidth,
                height: (d.value / niceMaxVal) * ch,
                tierHeight,
                paidHeight,
                tierY: pad.top + ch - tierHeight,
                paidY: pad.top + ch - tierHeight - paidHeight,
                ...d,
            };
        });

        // Generate nice Y ticks
        const tickCount = Math.ceil(niceMaxVal / tickSpacing) + 1;
        const ticks = Array.from({ length: Math.min(tickCount, 6) }, (_, i) => {
            const value = i * tickSpacing;
            return {
                value,
                y: pad.top + ch - (value / niceMaxVal) * ch,
            };
        }).filter((t) => t.value <= niceMaxVal);

        return { bars: barData, yTicks: ticks };
    }, [data, cw, ch, pad.left, pad.top, maxDataValue]);

    const formatCompactVal = (v: number): string => {
        const abs = Math.abs(v);
        if (abs >= 1e6) {
            const m = v / 1e6;
            return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
        }
        if (abs >= 1e3) {
            const k = v / 1e3;
            return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
        }
        return Number.isInteger(v) ? v.toString() : Number(v).toString();
    };

    const formatVal = (v: number) => {
        if (metric === "pollen") return formatActivityPollen(v);
        if (Math.abs(v) >= 1e3) return formatCompactVal(v);
        return Math.round(v).toString();
    };

    const formatAccessibleValue = (v: number) => {
        if (metric === "pollen") return formatActivityPollen(v);
        if (Number.isInteger(v)) {
            return v.toLocaleString();
        }
        return v.toFixed(2);
    };

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[180px]">
                <div className="text-center">
                    <p className="text-sm text-theme-text-muted font-medium">
                        No usage data available
                    </p>
                    <p className="text-xs text-theme-text-muted mt-1">
                        Make some API requests to see your analytics
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full" style={{ height }}>
            {/* biome-ignore lint/a11y/useSemanticElements: SVG group contains keyboard-operable chart bars. */}
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${width} ${height}`}
                className="overflow-visible"
                role="group"
                aria-label={`${label} chart. Select a bar to filter the table; select it again or press Escape to show the full period.`}
            >
                {/* Grid lines */}
                {yTicks.map((t) => (
                    <g key={`tick-${t.value}`}>
                        <line
                            x1={pad.left}
                            y1={t.y}
                            x2={width - pad.right}
                            y2={t.y}
                            stroke={CHART_COLORS.grid}
                            strokeDasharray="4 4"
                        />
                        <text
                            x={pad.left - 8}
                            y={t.y}
                            textAnchor="end"
                            alignmentBaseline="middle"
                            className="text-micro fill-theme-text-muted font-medium"
                        >
                            {formatVal(t.value)}
                        </text>
                    </g>
                ))}

                {/* X axis labels */}
                {bars.length > 0 && (
                    <>
                        <text
                            x={bars[0].x + bars[0].width / 2}
                            y={height - 8}
                            textAnchor="middle"
                            className="text-micro fill-theme-text-muted"
                        >
                            {bars[0].label}
                        </text>
                        {bars.length > 4 && (
                            <text
                                x={
                                    bars[Math.floor(bars.length / 2)].x +
                                    bars[Math.floor(bars.length / 2)].width / 2
                                }
                                y={height - 8}
                                textAnchor="middle"
                                className="text-micro fill-theme-text-muted"
                            >
                                {bars[Math.floor(bars.length / 2)].label}
                            </text>
                        )}
                        <text
                            x={
                                bars[bars.length - 1].x +
                                bars[bars.length - 1].width / 2
                            }
                            y={height - 8}
                            textAnchor="middle"
                            className="text-micro fill-theme-text-muted"
                        >
                            {bars[bars.length - 1].label}
                        </text>
                    </>
                )}

                {/* Bars - stacked wallet split: Quest at bottom, paid on top */}
                {bars.map((bar) => (
                    <g key={bar.label}>
                        {/* Quest segment (bottom) */}
                        {bar.tierHeight > 0 && (
                            <rect
                                x={bar.x}
                                y={
                                    bar.tierY -
                                    (bar.tierHeight * animationProgress -
                                        bar.tierHeight)
                                }
                                width={bar.width}
                                height={Math.max(
                                    0,
                                    bar.tierHeight * animationProgress,
                                )}
                                rx={bar.paidHeight > 0 ? 0 : 2}
                                style={{
                                    fill:
                                        period.bucket &&
                                        period.bucket !==
                                            activityBucketKey(
                                                bar.timestamp,
                                                period,
                                            )
                                            ? "var(--polli-color-text-muted)"
                                            : TIER_BALANCE_CHART_COLOR,
                                    opacity:
                                        period.bucket &&
                                        period.bucket !==
                                            activityBucketKey(
                                                bar.timestamp,
                                                period,
                                            )
                                            ? 0.3
                                            : 1,
                                    transition: "opacity 0.15s ease-out",
                                }}
                            />
                        )}
                        {/* Paid segment (top) */}
                        {bar.paidHeight > 0 && (
                            <rect
                                x={bar.x}
                                y={
                                    bar.paidY -
                                    (bar.height * animationProgress -
                                        bar.height)
                                }
                                width={bar.width}
                                height={Math.max(
                                    0,
                                    bar.paidHeight * animationProgress,
                                )}
                                rx={2}
                                style={{
                                    fill:
                                        period.bucket &&
                                        period.bucket !==
                                            activityBucketKey(
                                                bar.timestamp,
                                                period,
                                            )
                                            ? "var(--polli-color-text-muted)"
                                            : PAID_BALANCE_CHART_COLOR,
                                    opacity:
                                        period.bucket &&
                                        period.bucket !==
                                            activityBucketKey(
                                                bar.timestamp,
                                                period,
                                            )
                                            ? 0.3
                                            : 1,
                                    transition: "opacity 0.15s ease-out",
                                }}
                            />
                        )}
                        {/* Full-height targets let touch and keyboard users select small or empty buckets. */}
                        {/* biome-ignore lint/a11y/useSemanticElements: SVG rect provides the chart bar hit target; supports button keyboard interactions. */}
                        <rect
                            x={bar.x - (cw / bars.length - bar.width) / 2}
                            y={pad.top}
                            width={cw / bars.length}
                            height={ch}
                            fill="transparent"
                            role="button"
                            aria-pressed={
                                period.bucket ===
                                activityBucketKey(bar.timestamp, period)
                            }
                            tabIndex={canSelect(bar) ? 0 : -1}
                            aria-disabled={!canSelect(bar)}
                            aria-label={`${bar.fullDate}: ${formatAccessibleValue(bar.value)} ${metric}. ${period.bucket === activityBucketKey(bar.timestamp, period) ? "Show full period" : "Filter table"}`}
                            className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-theme-text-muted"
                            style={{
                                cursor: canSelect(bar) ? "pointer" : "default",
                            }}
                            onClick={() => {
                                if (canSelect(bar)) onSelect(bar);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    event.preventDefault();
                                    if (period.bucket) onClearSelection();
                                    event.currentTarget.blur();
                                }
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    if (canSelect(bar)) onSelect(bar);
                                }
                            }}
                        />
                    </g>
                ))}
            </svg>
        </div>
    );
};
