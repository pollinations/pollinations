import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DataPoint, Metric } from "../types";

type ChartProps = {
    data: DataPoint[];
    metric: Metric;
    showModelBreakdown: boolean;
};

export const Chart: FC<ChartProps> = ({ data, metric, showModelBreakdown }) => {
    const [hovered, setHovered] = useState<number | null>(null);
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

    // Responsive
    useEffect(() => {
        const update = () =>
            containerRef.current && setWidth(containerRef.current.offsetWidth);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const height = 180;
    const pad = { top: 24, right: 20, bottom: 32, left: 55 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const { bars, yTicks } = useMemo(() => {
        if (data.length === 0) return { bars: [], yTicks: [] };

        const vals = data.map((d) => d.value);
        const max = Math.max(...vals);

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
            const packHeight = (d.packValue / niceMaxVal) * ch;
            return {
                x: pad.left + i * (barWidth + gap) + gap / 2,
                y: pad.top + ch - (d.value / niceMaxVal) * ch,
                width: barWidth,
                height: (d.value / niceMaxVal) * ch,
                tierHeight,
                packHeight,
                tierY: pad.top + ch - tierHeight,
                packY: pad.top + ch - tierHeight - packHeight,
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
    }, [data, cw, ch]);

    const formatVal = (v: number) => {
        if (v >= 1e6) {
            const m = v / 1e6;
            return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
        }
        if (v >= 1e3) {
            const k = v / 1e3;
            return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
        }
        return Math.round(v).toString();
    };

    const formatTooltipVal = (v: number) => {
        if (Number.isInteger(v)) {
            return v.toLocaleString();
        }
        return v.toFixed(2);
    };

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[180px] rounded-xl bg-gray-50 border border-dashed border-gray-200">
                <div className="text-center">
                    <p className="text-sm text-gray-400 font-medium">
                        No usage data available
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                        Make some API requests to see your analytics
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full" style={{ height }}>
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${width} ${height}`}
                className="overflow-visible"
                onMouseLeave={() => setHovered(null)}
                role="img"
                aria-label="Usage chart"
            >
                <title>Usage statistics chart</title>
                <defs>
                    <linearGradient
                        id="usageAreaGradient"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                    >
                        <stop
                            offset="0%"
                            stopColor="#8b5cf6"
                            stopOpacity="0.2"
                        />
                        <stop
                            offset="50%"
                            stopColor="#a78bfa"
                            stopOpacity="0.1"
                        />
                        <stop
                            offset="100%"
                            stopColor="#c4b5fd"
                            stopOpacity="0"
                        />
                    </linearGradient>
                    <filter
                        id="lineGlow"
                        x="-20%"
                        y="-20%"
                        width="140%"
                        height="140%"
                    >
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter
                        id="dotGlow"
                        x="-100%"
                        y="-100%"
                        width="300%"
                        height="300%"
                    >
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Grid lines */}
                {yTicks.map((t) => (
                    <g key={`tick-${t.value}`}>
                        <line
                            x1={pad.left}
                            y1={t.y}
                            x2={width - pad.right}
                            y2={t.y}
                            stroke="#e5e7eb"
                            strokeDasharray="4 4"
                        />
                        <text
                            x={pad.left - 8}
                            y={t.y}
                            textAnchor="end"
                            alignmentBaseline="middle"
                            className="text-[10px] fill-gray-400 font-medium"
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
                            className="text-[10px] fill-gray-400"
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
                                className="text-[10px] fill-gray-400"
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
                            className="text-[10px] fill-gray-400"
                        >
                            {bars[bars.length - 1].label}
                        </text>
                    </>
                )}

                {/* Bars - Stacked: tier (teal) at bottom, pack (purple) on top */}
                {bars.map((bar, idx) => (
                    <g key={bar.label}>
                        {/* Tier segment (bottom) - teal */}
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
                                rx={bar.packHeight > 0 ? 0 : 2}
                                style={{
                                    fill:
                                        hovered === idx ? "#5eead4" : "#99f6e4",
                                    transition: "fill 0.15s ease-out",
                                }}
                            />
                        )}
                        {/* Pack segment (top) - purple */}
                        {bar.packHeight > 0 && (
                            <rect
                                x={bar.x}
                                y={
                                    bar.packY -
                                    (bar.height * animationProgress -
                                        bar.height)
                                }
                                width={bar.width}
                                height={Math.max(
                                    0,
                                    bar.packHeight * animationProgress,
                                )}
                                rx={2}
                                style={{
                                    fill:
                                        hovered === idx ? "#c4b5fd" : "#ddd6fe",
                                    transition: "fill 0.15s ease-out",
                                }}
                            />
                        )}
                        {/* Invisible overlay for consistent hover area */}
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG rect for chart interaction */}
                        <rect
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={Math.max(0, bar.height * animationProgress)}
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={() => setHovered(idx)}
                        />
                    </g>
                ))}

                {/* Tooltip */}
                {hovered !== null &&
                    bars[hovered] &&
                    (() => {
                        const bar = bars[hovered];
                        const allBreakdown = bar.modelBreakdown || [];
                        const breakdown = allBreakdown.filter((m) => {
                            const val =
                                metric === "requests" ? m.requests : m.pollen;
                            return val > 0;
                        });
                        const hasBreakdown =
                            showModelBreakdown && breakdown.length > 0;
                        const lineHeight = 16;
                        const headerHeight = 48;
                        const separatorHeight = hasBreakdown ? 12 : 0;
                        const tooltipHeight =
                            headerHeight +
                            separatorHeight +
                            (hasBreakdown
                                ? breakdown.length * lineHeight + 8
                                : 0);
                        const tooltipWidth = hasBreakdown ? 280 : 160;
                        const tooltipX = Math.max(
                            pad.left,
                            Math.min(
                                bar.x + bar.width / 2 - tooltipWidth / 2,
                                width - pad.right - tooltipWidth,
                            ),
                        );
                        const tooltipY = Math.max(
                            pad.top,
                            bar.y - tooltipHeight - 10,
                        );

                        const dateOnly = bar.fullDate.replace(
                            /^[A-Za-z]+,\s*/,
                            "",
                        );

                        const truncateLabel = (label: string, maxLen = 28) =>
                            label.length > maxLen
                                ? `${label.substring(0, maxLen - 2)}...`
                                : label;

                        return (
                            <g style={{ pointerEvents: "none" }}>
                                <rect
                                    x={tooltipX}
                                    y={tooltipY}
                                    width={tooltipWidth}
                                    height={tooltipHeight}
                                    rx="8"
                                    fill="#18181b"
                                    opacity="0.95"
                                />
                                <text
                                    x={tooltipX + 12}
                                    y={tooltipY + 18}
                                    textAnchor="start"
                                    className="text-xs fill-gray-400"
                                >
                                    {dateOnly}
                                </text>
                                <text
                                    x={tooltipX + 12}
                                    y={tooltipY + 36}
                                    textAnchor="start"
                                    className="text-sm font-bold fill-white"
                                >
                                    {metric === "requests"
                                        ? "requests"
                                        : "pollen"}{" "}
                                    {formatTooltipVal(bar.value)}
                                </text>
                                {hasBreakdown && (
                                    <line
                                        x1={tooltipX + 12}
                                        y1={tooltipY + headerHeight + 2}
                                        x2={tooltipX + tooltipWidth - 12}
                                        y2={tooltipY + headerHeight + 2}
                                        stroke="#374151"
                                        strokeWidth="1"
                                    />
                                )}
                                {hasBreakdown &&
                                    breakdown.map(
                                        (
                                            m: {
                                                model: string;
                                                label: string;
                                                requests: number;
                                                pollen: number;
                                            },
                                            i: number,
                                        ) => (
                                            <g key={m.model}>
                                                <text
                                                    x={tooltipX + 12}
                                                    y={
                                                        tooltipY +
                                                        headerHeight +
                                                        separatorHeight +
                                                        4 +
                                                        i * lineHeight
                                                    }
                                                    className="text-xs fill-gray-300"
                                                >
                                                    {truncateLabel(m.label, 22)}
                                                </text>
                                                <text
                                                    x={
                                                        tooltipX +
                                                        tooltipWidth -
                                                        12
                                                    }
                                                    y={
                                                        tooltipY +
                                                        headerHeight +
                                                        separatorHeight +
                                                        4 +
                                                        i * lineHeight
                                                    }
                                                    textAnchor="end"
                                                    className="text-xs fill-white font-medium"
                                                >
                                                    {formatTooltipVal(
                                                        metric === "requests"
                                                            ? m.requests
                                                            : m.pollen,
                                                    )}
                                                </text>
                                            </g>
                                        ),
                                    )}
                            </g>
                        );
                    })()}
            </svg>
        </div>
    );
};
