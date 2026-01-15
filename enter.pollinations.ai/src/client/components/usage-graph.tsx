import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { getModelDisplayName } from "./model-utils.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type _UsageRecord = {
    timestamp: string;
    type: string;
    model: string | null;
    api_key: string | null;
    api_key_type: string | null;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_image_tokens: number;
    cost_usd: number;
    response_time_ms: number | null;
};

type DailyUsageRecord = {
    date: string;
    event_type: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    api_key_names: string[];
};

type TimeRange = "7d" | "30d" | "all" | "custom";
type Metric = "requests" | "pollen" | "tokens";

type FilterState = {
    timeRange: TimeRange;
    customDays: number;
    metric: Metric;
    selectedKeys: string[];
    selectedModels: string[];
};

type ModelBreakdown = {
    model: string;
    label: string;
    requests: number;
    pollen: number;
    tokens: number;
};
type DataPoint = {
    label: string;
    value: number;
    timestamp: Date;
    fullDate: string;
    modelBreakdown?: ModelBreakdown[];
};
type SelectOption = { value: string | null; label: string };
type _ApiKeyInfo = { id: string; name?: string | null; start?: string | null };

// Build model registry from shared source (same as pricing table)
const ALL_MODELS = [
    ...Object.keys(TEXT_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "text" as const,
    })),
    ...Object.keys(IMAGE_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "image" as const,
    })),
];

// Time constants in milliseconds
const _MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const MS_PER_WEEK = MS_PER_DAY * 7;
const MS_PER_30_DAYS = MS_PER_DAY * 30;

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER COMPONENTS - Matching existing dashboard patterns
// ═══════════════════════════════════════════════════════════════════════════════

type FilterButtonProps = {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    ariaLabel?: string;
};

const FilterButton: FC<FilterButtonProps> = ({
    active,
    onClick,
    children,
    ariaLabel,
}) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200",
            active
                ? "bg-green-950 text-green-100"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
        )}
    >
        {children}
    </button>
);

type SelectProps = {
    options: SelectOption[];
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
};

const _Select: FC<SelectProps> = ({
    options,
    value,
    onChange,
    placeholder,
    disabled,
    disabledText,
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full",
                    "border transition-all duration-200 min-w-[140px]",
                    disabled
                        ? "bg-gray-100 border-gray-200 cursor-not-allowed opacity-60"
                        : open
                          ? "bg-green-950 border-green-950"
                          : "bg-gray-100 border-gray-100 hover:bg-gray-200",
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? "text-gray-400"
                            : open
                              ? "text-green-100"
                              : selected?.value
                                ? "text-gray-600"
                                : "text-gray-600",
                    )}
                >
                    {disabled ? disabledText : selected?.label || placeholder}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open ? "text-green-100 rotate-180" : "text-gray-400",
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <title>Toggle dropdown</title>
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            {open && !disabled && (
                <div className="absolute bottom-full left-0 mb-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    {options.map((opt) => (
                        <button
                            type="button"
                            key={opt.value ?? "_all"}
                            onClick={() => {
                                onChange(opt.value);
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors",
                                value === opt.value
                                    ? "bg-green-950 text-green-100 font-medium"
                                    : "text-gray-600 hover:bg-gray-100",
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// Multi-select dropdown with checkboxes for models
type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    itemLabel?: string;
};

const MultiSelect: FC<MultiSelectProps> = ({
    options,
    selected,
    onChange,
    placeholder,
    disabled,
    disabledText,
    align = "start",
    itemLabel = "items",
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const isAllSelected = selected.length === 0;

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const toggleModel = (modelId: string) => {
        if (selected.includes(modelId)) {
            onChange(selected.filter((m) => m !== modelId));
        } else {
            onChange([...selected, modelId]);
        }
    };

    const selectAll = () => onChange([]);

    const displayText = disabled
        ? disabledText
        : isAllSelected
          ? placeholder
          : selected.length === 1
            ? options.find((o) => o.value === selected[0])?.label || selected[0]
            : `${selected.length} ${itemLabel}`;

    return (
        <div ref={ref} className="relative group">
            <button
                type="button"
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full",
                    "border transition-all duration-200 min-w-[140px]",
                    disabled
                        ? "bg-gray-100 border-gray-200 cursor-not-allowed opacity-60"
                        : open
                          ? "bg-green-950 border-green-950"
                          : "bg-gray-100 border-gray-100 hover:bg-gray-200",
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? "text-gray-400"
                            : open
                              ? "text-green-100"
                              : "text-gray-600",
                    )}
                >
                    {displayText}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open ? "text-green-100 rotate-180" : "text-gray-400",
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <title>Toggle dropdown</title>
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            {disabled && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                    No models used yet
                </span>
            )}
            {open && !disabled && (
                <div
                    className={cn(
                        "absolute bottom-full mb-1 min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden",
                        align === "end" ? "right-0" : "left-0",
                    )}
                >
                    <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                        {/* All option */}
                        <button
                            type="button"
                            onClick={selectAll}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                isAllSelected
                                    ? "bg-green-950 text-green-100 font-medium"
                                    : "text-gray-600 hover:bg-gray-100",
                            )}
                        >
                            <span
                                className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                    isAllSelected
                                        ? "bg-green-950 border-green-950 text-green-100"
                                        : "border-gray-300",
                                )}
                            >
                                {isAllSelected && "✓"}
                            </span>
                            All Models
                        </button>
                        {/* Individual models */}
                        {options.map((opt) => {
                            const isChecked = selected.includes(opt.value);
                            return (
                                <button
                                    type="button"
                                    key={opt.value}
                                    onClick={() => toggleModel(opt.value)}
                                    className={cn(
                                        "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                        isChecked
                                            ? "bg-green-950 text-green-100"
                                            : "text-gray-600 hover:bg-gray-100",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                            isChecked
                                                ? "bg-green-950 border-green-950 text-green-100"
                                                : "border-gray-300",
                                        )}
                                    >
                                        {isChecked && "✓"}
                                    </span>
                                    <span className="whitespace-nowrap">
                                        {opt.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAT DISPLAY - Matching existing card patterns
// ═══════════════════════════════════════════════════════════════════════════════

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-pink-400 font-bold">
            {label}
        </span>
        <span className="text-lg font-bold text-green-950 tabular-nums">
            {value}
        </span>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// BAR CHART - Clean visualization
// ═══════════════════════════════════════════════════════════════════════════════

type ChartProps = {
    data: DataPoint[];
    metric: Metric;
    showModelBreakdown: boolean;
};

const Chart: FC<ChartProps> = ({ data, metric, showModelBreakdown }) => {
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
        const pMax = max * 1.1 || 1;

        const barWidth = Math.max(4, (cw / data.length) * 0.7);
        const gap = (cw / data.length) * 0.3;

        const barData = data.map((d, i) => ({
            x: pad.left + i * (barWidth + gap) + gap / 2,
            y: pad.top + ch - (d.value / pMax) * ch,
            width: barWidth,
            height: (d.value / pMax) * ch,
            ...d,
        }));

        // Y ticks
        const ticks = Array.from({ length: 4 }, (_, i) => ({
            value: (pMax * (3 - i)) / 3,
            y: pad.top + (i / 3) * ch,
        }));

        return { bars: barData, yTicks: ticks };
    }, [data, cw, ch]);

    const formatVal = (v: number) =>
        metric === "pollen"
            ? v.toFixed(2)
            : metric === "tokens"
              ? v >= 1e6
                  ? `${(v / 1e6).toFixed(1)}M`
                  : v >= 1e3
                    ? `${(v / 1e3).toFixed(1)}K`
                    : v.toFixed(0)
              : v.toFixed(0);

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
                    {/* Gradient for area fill - using existing violet/purple theme */}
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
                    {/* Glow effect */}
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
                    {/* Dot glow */}
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

                {/* Bars */}
                {bars.map((bar, idx) => (
                    <g key={bar.label}>
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG rect for chart interaction */}
                        <rect
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={Math.max(0, bar.height * animationProgress)}
                            rx={2}
                            fill={hovered === idx ? "#8b5cf6" : "#7c3aed"}
                            style={{
                                transition: "fill 0.15s ease-out",
                                cursor: "pointer",
                            }}
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
                        // Filter to only show non-zero values for current metric
                        const breakdown = allBreakdown.filter((m) => {
                            const val =
                                metric === "requests"
                                    ? m.requests
                                    : metric === "pollen"
                                      ? m.pollen
                                      : m.tokens;
                            return val > 0;
                        });
                        const hasBreakdown =
                            showModelBreakdown && breakdown.length > 0;
                        const lineHeight = 16;
                        // Layout: Date (20) + Total line (20) + separator (8) + breakdown items
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

                        // Format date without weekday (e.g., "January 8, 2026")
                        const dateOnly = bar.fullDate.replace(
                            /^[A-Za-z]+,\s*/,
                            "",
                        );

                        // Truncate model name if too long
                        const truncateLabel = (label: string, maxLen = 28) =>
                            label.length > maxLen
                                ? `${label.substring(0, maxLen - 2)}...`
                                : label;

                        return (
                            <g style={{ pointerEvents: "none" }}>
                                {/* Tooltip box */}
                                <rect
                                    x={tooltipX}
                                    y={tooltipY}
                                    width={tooltipWidth}
                                    height={tooltipHeight}
                                    rx="8"
                                    fill="#0f172a"
                                    opacity="0.95"
                                />
                                {/* Date at top left */}
                                <text
                                    x={tooltipX + 12}
                                    y={tooltipY + 18}
                                    textAnchor="start"
                                    className="text-xs fill-gray-400"
                                >
                                    {dateOnly}
                                </text>
                                {/* Total line with metric label */}
                                <text
                                    x={tooltipX + 12}
                                    y={tooltipY + 36}
                                    textAnchor="start"
                                    className="text-sm font-bold fill-white"
                                >
                                    Total (
                                    {metric === "requests"
                                        ? "requests"
                                        : metric === "pollen"
                                          ? "pollen"
                                          : "tokens"}
                                    ): {formatVal(bar.value)}
                                </text>
                                {/* Separator line */}
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
                                {/* Model breakdown - show all non-zero */}
                                {hasBreakdown &&
                                    breakdown.map(
                                        (
                                            m: {
                                                model: string;
                                                label: string;
                                                requests: number;
                                                pollen: number;
                                                tokens: number;
                                            },
                                            i: number,
                                        ) => (
                                            <text
                                                key={m.model}
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
                                                {truncateLabel(m.label)}:{" "}
                                                {formatVal(
                                                    metric === "requests"
                                                        ? m.requests
                                                        : metric === "pollen"
                                                          ? m.pollen
                                                          : m.tokens,
                                                )}
                                            </text>
                                        ),
                                    )}
                            </g>
                        );
                    })()}
            </svg>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

type UsageGraphProps = Record<string, never>;

// Map time range to approximate record limit (rough estimate based on usage patterns)
const _getRecordLimit = (timeRange: TimeRange, customDays: number): number => {
    switch (timeRange) {
        case "7d":
            return 3500; // ~500/day * 7
        case "30d":
            return 10000; // cap at 10k
        case "all":
            return 10000; // cap at 10k
        case "custom":
            return Math.min(customDays * 500, 10000);
    }
};

export const UsageGraph: FC<UsageGraphProps> = () => {
    const [dailyUsage, setDailyUsage] = useState<DailyUsageRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasFetched, setHasFetched] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState<FilterState>({
        timeRange: "7d",
        customDays: 14,
        metric: "pollen",
        selectedKeys: [], // Empty means "All"
        selectedModels: [], // Empty means "All"
    });

    // Fetch all usage data (90 days, handled by backend)
    const fetchUsage = useCallback(() => {
        if (hasFetched) return;
        setLoading(true);
        setError(null);

        fetch("/api/usage/daily")
            .then((r) => {
                if (!r.ok)
                    throw new Error(`Failed to fetch usage data: ${r.status}`);
                return r.json() as Promise<{ usage: DailyUsageRecord[] }>;
            })
            .then((data) => {
                setDailyUsage(data?.usage || []);
                setHasFetched(true);
            })
            .catch((err) => {
                console.error("Usage fetch error:", err);
                setError(err.message || "Failed to load usage data");
                setDailyUsage([]);
            })
            .finally(() => setLoading(false));
    }, [hasFetched]);

    // Lazy load: fetch data only when component comes into view
    useEffect(() => {
        if (hasFetched || !containerRef.current) return;

        const container = containerRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !hasFetched) {
                    fetchUsage();
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }, // Trigger when 10% visible
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [hasFetched, fetchUsage]);

    // Models that appear in usage data, enriched with registry display names
    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        for (const r of dailyUsage) {
            if (r.model) modelIds.add(r.model);
        }

        return Array.from(modelIds)
            .map((id) => {
                const registered = ALL_MODELS.find((m) => m.id === id);
                return { id, label: registered?.label || id };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dailyUsage]);

    // API keys that appear in usage data (extracted from TinyBird data)
    const usedKeys = useMemo(() => {
        const keyNames = new Set<string>();
        for (const r of dailyUsage) {
            if (r.api_key_names) {
                for (const name of r.api_key_names) {
                    if (name) keyNames.add(name);
                }
            }
        }
        return Array.from(keyNames).sort();
    }, [dailyUsage]);

    // Filter and aggregate daily usage data
    const { chartData, stats, filteredData } = useMemo(() => {
        const now = new Date();
        const cutoff =
            filters.timeRange === "7d"
                ? new Date(now.getTime() - MS_PER_WEEK)
                : filters.timeRange === "30d"
                  ? new Date(now.getTime() - MS_PER_30_DAYS)
                  : filters.timeRange === "custom"
                    ? new Date(now.getTime() - filters.customDays * MS_PER_DAY)
                    : new Date(0);

        // Filter records by date and other criteria
        const filtered = dailyUsage.filter((r: DailyUsageRecord) => {
            const recordDate = new Date(`${r.date}T00:00:00`);
            if (recordDate < cutoff) return false;
            if (
                filters.selectedModels.length > 0 &&
                r.model &&
                !filters.selectedModels.includes(r.model)
            )
                return false;
            if (
                filters.selectedKeys.length > 0 &&
                (!r.api_key_names ||
                    !filters.selectedKeys.some((k) =>
                        r.api_key_names.includes(k),
                    ))
            )
                return false;
            return true;
        });

        // Aggregate by date (sum all models/event_types for each day)
        type DayBucket = {
            requests: number;
            pollen: number;
            tokens: number;
            byModel: Map<
                string,
                { requests: number; pollen: number; tokens: number }
            >;
        };
        const buckets = new Map<string, DayBucket>();

        filtered.forEach((r: DailyUsageRecord) => {
            const dateKey = r.date;
            const cur = buckets.get(dateKey) || {
                requests: 0,
                pollen: 0,
                tokens: 0,
                byModel: new Map(),
            };
            const tokens = (r.input_tokens || 0) + (r.output_tokens || 0);
            cur.requests += r.requests || 0;
            cur.pollen += r.cost_usd || 0;
            cur.tokens += tokens;

            // Track per-model breakdown
            if (r.model) {
                const modelData = cur.byModel.get(r.model) || {
                    requests: 0,
                    pollen: 0,
                    tokens: 0,
                };
                modelData.requests += r.requests || 0;
                modelData.pollen += r.cost_usd || 0;
                modelData.tokens += tokens;
                cur.byModel.set(r.model, modelData);
            }
            buckets.set(dateKey, cur);
        });

        // Generate full date range from cutoff to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(
            Math.max(cutoff.getTime(), today.getTime() - 90 * MS_PER_DAY),
        );
        startDate.setHours(0, 0, 0, 0);

        const allDates: string[] = [];
        const currentDate = new Date(startDate);
        while (currentDate <= today) {
            allDates.push(currentDate.toISOString().split("T")[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Build chart data with zero-fill for missing days
        const sorted = allDates.map((dateStr) => {
            const date = new Date(`${dateStr}T00:00:00`);
            const d = buckets.get(dateStr) || {
                requests: 0,
                pollen: 0,
                tokens: 0,
                byModel: new Map(),
            };
            const modelBreakdown: ModelBreakdown[] = Array.from(
                d.byModel.entries(),
            )
                .map(([modelId, modelStats]) => {
                    const registered = ALL_MODELS.find((m) => m.id === modelId);
                    return {
                        model: modelId,
                        label: registered?.label || modelId,
                        requests: modelStats.requests,
                        pollen: modelStats.pollen,
                        tokens: modelStats.tokens,
                    };
                })
                .sort((a, b) => b.requests - a.requests);

            return {
                label: date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                }),
                fullDate: date.toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                }),
                value: d[filters.metric],
                timestamp: date,
                modelBreakdown,
            };
        });

        const totalReq = filtered.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.requests || 0),
            0,
        );
        const totalPollen = filtered.reduce(
            (s: number, r: DailyUsageRecord) => s + (r.cost_usd || 0),
            0,
        );
        const totalTok = filtered.reduce(
            (s: number, r: DailyUsageRecord) =>
                s + (r.input_tokens || 0) + (r.output_tokens || 0),
            0,
        );

        return {
            chartData: sorted,
            stats: {
                totalRequests: totalReq,
                totalPollen,
                totalTokens: totalTok,
            },
            filteredData: filtered,
        };
    }, [dailyUsage, filters]);

    const formatTokens = (n: number) =>
        n >= 1e6
            ? `${(n / 1e6).toFixed(1)}M`
            : n >= 1e3
              ? `${(n / 1e3).toFixed(1)}K`
              : n.toString();

    // Key options for multi-select (from TinyBird usage data)
    const keySelectOptions = usedKeys.map((name) => ({
        value: name,
        label: name,
    }));

    // Model options for multi-select
    const modelSelectOptions = usedModels.map((m) => ({
        value: m.id,
        label: m.label,
    }));

    // Show model breakdown in tooltip when multiple models are visible
    const showModelBreakdown =
        filters.selectedModels.length === 0 ||
        filters.selectedModels.length > 1;

    return (
        <div ref={containerRef} className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">Usage Analytics</h2>
            </div>
            <div className="bg-violet-50/30 rounded-2xl p-6 border border-violet-300">
                {loading && (
                    <div className="animate-pulse space-y-4">
                        <div className="flex gap-2">
                            <div className="h-8 bg-gray-200 rounded-full w-16" />
                            <div className="h-8 bg-gray-200 rounded-full w-16" />
                            <div className="h-8 bg-gray-200 rounded-full w-16" />
                        </div>
                        <div className="h-[180px] bg-gray-100 rounded-xl" />
                    </div>
                )}
                {error && !loading && (
                    <div className="flex items-center justify-center h-[180px] rounded-xl bg-red-50 border border-dashed border-red-200">
                        <div className="text-center">
                            <p className="text-sm text-red-500 font-medium">
                                {error}
                            </p>
                            <button
                                type="button"
                                onClick={() => fetchUsage()}
                                className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )}
                {!loading && !error && (
                    <>
                        {/* Filters Row 1: Time Range + Metric */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {(["7d", "30d", "all"] as TimeRange[]).map(
                                    (t) => (
                                        <FilterButton
                                            key={t}
                                            active={filters.timeRange === t}
                                            onClick={() =>
                                                setFilters((f) => ({
                                                    ...f,
                                                    timeRange: t,
                                                }))
                                            }
                                        >
                                            {t === "7d"
                                                ? "7 days"
                                                : t === "30d"
                                                  ? "30 days"
                                                  : "90 days"}
                                        </FilterButton>
                                    ),
                                )}
                                <FilterButton
                                    active={filters.timeRange === "custom"}
                                    onClick={() =>
                                        setFilters((f) => ({
                                            ...f,
                                            timeRange: "custom",
                                        }))
                                    }
                                >
                                    Custom
                                </FilterButton>
                                {filters.timeRange === "custom" && (
                                    <div className="flex items-center gap-1.5 ml-1">
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={filters.customDays}
                                            onChange={(e) =>
                                                setFilters((f) => ({
                                                    ...f,
                                                    customDays: Math.max(
                                                        1,
                                                        Math.min(
                                                            365,
                                                            parseInt(
                                                                e.target.value,
                                                                10,
                                                            ) || 1,
                                                        ),
                                                    ),
                                                }))
                                            }
                                            className="w-14 px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white text-green-950 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 tabular-nums"
                                        />
                                        <span className="text-xs text-gray-500">
                                            days
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-1.5 items-center">
                                {(
                                    ["requests", "pollen", "tokens"] as Metric[]
                                ).map((m) => (
                                    <FilterButton
                                        key={m}
                                        active={filters.metric === m}
                                        onClick={() =>
                                            setFilters((f) => ({
                                                ...f,
                                                metric: m,
                                            }))
                                        }
                                    >
                                        {m === "requests"
                                            ? "Requests"
                                            : m === "pollen"
                                              ? "Pollen"
                                              : "Tokens"}
                                    </FilterButton>
                                ))}
                            </div>
                        </div>

                        {/* Filters Row 2: Dropdowns */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <MultiSelect
                                options={modelSelectOptions}
                                selected={filters.selectedModels}
                                onChange={(v) =>
                                    setFilters((f) => ({
                                        ...f,
                                        selectedModels: v,
                                    }))
                                }
                                placeholder="All Models"
                                disabled={modelSelectOptions.length === 0}
                                disabledText="0 models used"
                                itemLabel="models"
                            />
                            <MultiSelect
                                options={keySelectOptions}
                                selected={filters.selectedKeys}
                                onChange={(v) =>
                                    setFilters((f) => ({
                                        ...f,
                                        selectedKeys: v,
                                    }))
                                }
                                placeholder="All Keys"
                                disabled={usedKeys.length === 0}
                                disabledText="No keys"
                                align="end"
                                itemLabel="keys"
                            />
                        </div>

                        {/* Chart */}
                        <div className="relative bg-white rounded-xl p-4 border border-violet-200 mb-4">
                            <Chart
                                data={chartData}
                                metric={filters.metric}
                                showModelBreakdown={showModelBreakdown}
                            />
                        </div>

                        {/* Stats Row */}
                        <div className="flex items-center gap-4 p-3 bg-white/50 rounded-xl border border-violet-200">
                            <div className="flex-1 grid grid-cols-3 gap-4">
                                <Stat
                                    label="Requests"
                                    value={stats.totalRequests.toLocaleString()}
                                />
                                <Stat
                                    label="Pollen"
                                    value={stats.totalPollen.toFixed(2)}
                                />
                                <Stat
                                    label="Tokens"
                                    value={formatTokens(stats.totalTokens)}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (filteredData.length === 0) return;
                                    const headers = [
                                        "date",
                                        "event_type",
                                        "model",
                                        "requests",
                                        "cost_usd",
                                        "input_tokens",
                                        "output_tokens",
                                    ];
                                    const rows = filteredData.map(
                                        (r: DailyUsageRecord) =>
                                            [
                                                r.date,
                                                r.event_type || "",
                                                r.model || "",
                                                r.requests || 0,
                                                r.cost_usd || 0,
                                                r.input_tokens || 0,
                                                r.output_tokens || 0,
                                            ].join(","),
                                    );
                                    const csv = [
                                        headers.join(","),
                                        ...rows,
                                    ].join("\n");
                                    const blob = new Blob([csv], {
                                        type: "text/csv",
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `usage-${filters.timeRange}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-100 hover:bg-violet-200 transition-colors border border-violet-300 text-violet-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={filteredData.length === 0}
                                title={
                                    filteredData.length === 0
                                        ? "No data to download"
                                        : `Download CSV (${filteredData.length} rows)`
                                }
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <title>Download CSV</title>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                CSV
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default UsageGraph;
