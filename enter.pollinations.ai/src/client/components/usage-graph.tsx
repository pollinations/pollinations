import { useState, useMemo, useEffect, useRef } from "react";
import type { FC } from "react";
import { cn } from "@/util.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { getModelDisplayName } from "./model-utils.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type UsageRecord = {
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

type TimeRange = "24h" | "7d" | "30d" | "all" | "custom";
type Metric = "requests" | "cost" | "tokens";
type Modality = "all" | "text" | "image" | "audio" | "video";

type FilterState = {
    timeRange: TimeRange;
    customDays: number;
    metric: Metric;
    modality: Modality;
    apiKey: string | null;
    selectedModels: string[]; // Changed to array for multi-select
};

type ModelBreakdown = { model: string; label: string; requests: number; cost: number; tokens: number };
type DataPoint = { label: string; value: number; timestamp: Date; fullDate: string; modelBreakdown?: ModelBreakdown[] };
type SelectOption = { value: string | null; label: string };
type ApiKeyInfo = { id: string; name?: string | null; start?: string | null };

// Build model registry from shared source (same as pricing table)
const ALL_MODELS = [
    ...Object.keys(TEXT_SERVICES).map((id) => ({ id, label: getModelDisplayName(id), type: "text" as const })),
    ...Object.keys(IMAGE_SERVICES).map((id) => ({ id, label: getModelDisplayName(id), type: "image" as const })),
];

// Time constants in milliseconds
const MS_PER_HOUR = 3600000;
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

const FilterButton: FC<FilterButtonProps> = ({ active, onClick, children, ariaLabel }) => (
    <button
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200",
            active
                ? "bg-green-950 text-green-100"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
};

const Select: FC<SelectProps> = ({ options, value, onChange, placeholder }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg",
                    "border transition-all duration-150 min-w-[130px]",
                    open
                        ? "bg-violet-50 border-violet-400"
                        : "bg-white border-gray-200 hover:border-violet-300"
                )}
            >
                <span className={cn("truncate flex-1 text-left", selected?.value ? "text-green-950" : "text-gray-400")}>
                    {selected?.label || placeholder}
                </span>
                <svg className={cn("w-3 h-3 text-gray-400 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-white border border-violet-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                        {options.map((opt) => (
                            <button
                                key={opt.value ?? "_all"}
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className={cn(
                                    "w-full px-3 py-2 text-left text-xs transition-colors",
                                    value === opt.value ? "bg-violet-100 text-violet-900 font-medium" : "text-gray-700 hover:bg-gray-50"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
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
};

const MultiSelect: FC<MultiSelectProps> = ({ options, selected, onChange, placeholder }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const isAllSelected = selected.length === 0;

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

    const displayText = isAllSelected
        ? placeholder
        : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || selected[0]
        : `${selected.length} models`;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg",
                    "border transition-all duration-150 min-w-[130px]",
                    open
                        ? "bg-violet-50 border-violet-400"
                        : "bg-white border-gray-200 hover:border-violet-300"
                )}
            >
                <span className={cn("truncate flex-1 text-left", isAllSelected ? "text-gray-400" : "text-green-950")}>
                    {displayText}
                </span>
                <svg className={cn("w-3 h-3 text-gray-400 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] bg-white border border-violet-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                        {/* All option */}
                        <button
                            onClick={selectAll}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2",
                                isAllSelected ? "bg-violet-100 text-violet-900 font-medium" : "text-gray-700 hover:bg-gray-50"
                            )}
                        >
                            <span className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                                isAllSelected ? "bg-violet-600 border-violet-600 text-white" : "border-gray-300"
                            )}>
                                {isAllSelected && "✓"}
                            </span>
                            All Models
                        </button>
                        {/* Individual models */}
                        {options.map((opt) => {
                            const isChecked = selected.includes(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleModel(opt.value)}
                                    className={cn(
                                        "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2",
                                        isChecked ? "bg-violet-50 text-violet-900" : "text-gray-700 hover:bg-gray-50"
                                    )}
                                >
                                    <span className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                                        isChecked ? "bg-violet-600 border-violet-600 text-white" : "border-gray-300"
                                    )}>
                                        {isChecked && "✓"}
                                    </span>
                                    {opt.label}
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
        <span className="text-[10px] uppercase tracking-wide text-pink-400 font-bold">{label}</span>
        <span className="text-lg font-bold text-green-950 tabular-nums">{value}</span>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// BEZIER CURVE CHART - Smooth, polished visualization
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
            setAnimationProgress(1 - Math.pow(1 - progress, 3));
            if (progress < 1) {
                animationId = requestAnimationFrame(animate);
            }
        };
        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, [data]);

    // Responsive
    useEffect(() => {
        const update = () => containerRef.current && setWidth(containerRef.current.offsetWidth);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const height = 180;
    const pad = { top: 24, right: 20, bottom: 32, left: 55 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const { points, yTicks, bezierPath, areaPath } = useMemo(() => {
        if (data.length === 0) return { points: [], yTicks: [], bezierPath: "", areaPath: "" };

        const vals = data.map((d) => d.value);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const range = max - min || 1;
        const pMin = Math.max(0, min - range * 0.1);
        const pMax = max + range * 0.15;

        const pts = data.map((d, i) => ({
            x: pad.left + (i / Math.max(1, data.length - 1)) * cw,
            y: pad.top + (1 - (d.value - pMin) / (pMax - pMin)) * ch,
            ...d,
        }));

        // Bezier curve path
        let path = "";
        if (pts.length > 0) {
            path = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) {
                const prev = pts[i - 1];
                const curr = pts[i];
                const tension = 0.3;
                const cp1x = prev.x + (curr.x - prev.x) * tension;
                const cp2x = curr.x - (curr.x - prev.x) * tension;
                path += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
            }
        }

        // Area path
        const area = pts.length > 0
            ? `${path} L ${pts[pts.length - 1].x} ${pad.top + ch} L ${pts[0].x} ${pad.top + ch} Z`
            : "";

        // Y ticks
        const ticks = Array.from({ length: 4 }, (_, i) => ({
            value: pMin + ((pMax - pMin) * (3 - i)) / 3,
            y: pad.top + (i / 3) * ch,
        }));

        return { points: pts, yTicks: ticks, bezierPath: path, areaPath: area };
    }, [data, cw, ch]);

    const formatVal = (v: number) =>
        metric === "cost" ? `$${v.toFixed(3)}` :
        metric === "tokens" ? (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0)) :
        v.toFixed(0);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[180px] rounded-xl bg-gray-50 border border-dashed border-gray-200">
                <div className="text-center">
                    <p className="text-sm text-gray-400 font-medium">No usage data available</p>
                    <p className="text-xs text-gray-300 mt-1">Make some API requests to see your analytics</p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full" style={{ height }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible" onMouseLeave={() => setHovered(null)}>
                <defs>
                    {/* Gradient for area fill - using existing violet/purple theme */}
                    <linearGradient id="usageAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                        <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
                    </linearGradient>
                    {/* Glow effect */}
                    <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    {/* Dot glow */}
                    <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Grid lines */}
                {yTicks.map((t, i) => (
                    <g key={i}>
                        <line x1={pad.left} y1={t.y} x2={width - pad.right} y2={t.y} stroke="#e5e7eb" strokeDasharray="4 4" />
                        <text x={pad.left - 8} y={t.y} textAnchor="end" alignmentBaseline="middle" className="text-[10px] fill-gray-400 font-medium">
                            {formatVal(t.value)}
                        </text>
                    </g>
                ))}

                {/* X axis labels */}
                {points.length > 0 && (
                    <>
                        <text x={points[0].x} y={height - 8} textAnchor="start" className="text-[10px] fill-gray-400">{points[0].label}</text>
                        {points.length > 4 && <text x={points[Math.floor(points.length / 2)].x} y={height - 8} textAnchor="middle" className="text-[10px] fill-gray-400">{points[Math.floor(points.length / 2)].label}</text>}
                        <text x={points[points.length - 1].x} y={height - 8} textAnchor="end" className="text-[10px] fill-gray-400">{points[points.length - 1].label}</text>
                    </>
                )}

                {/* Animated area fill */}
                <path
                    d={areaPath}
                    fill="url(#usageAreaGradient)"
                    style={{
                        clipPath: `inset(0 ${100 - animationProgress * 100}% 0 0)`,
                        transition: "clip-path 0.1s ease-out",
                    }}
                />

                {/* Animated bezier line */}
                <path
                    d={bezierPath}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#lineGlow)"
                    style={{
                        strokeDasharray: 2000,
                        strokeDashoffset: 2000 * (1 - animationProgress),
                        transition: "stroke-dashoffset 0.1s ease-out",
                    }}
                />

                {/* Interactive areas & dots */}
                {points.map((pt, i) => (
                    <g key={i}>
                        <rect
                            x={pt.x - cw / points.length / 2}
                            y={pad.top}
                            width={cw / points.length}
                            height={ch}
                            fill="transparent"
                            onMouseEnter={() => setHovered(i)}
                            style={{ cursor: "crosshair" }}
                        />
                        <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={hovered === i ? 6 : 4}
                            fill={hovered === i ? "#fff" : "#7c3aed"}
                            stroke="#7c3aed"
                            strokeWidth="2"
                            filter={hovered === i ? "url(#dotGlow)" : undefined}
                            style={{
                                opacity: animationProgress,
                                transition: "r 0.15s ease-out, opacity 0.3s ease-out",
                            }}
                        />
                    </g>
                ))}

                {/* Tooltip */}
                {hovered !== null && points[hovered] && (() => {
                    const pt = points[hovered];
                    const breakdown = pt.modelBreakdown || [];
                    const hasBreakdown = showModelBreakdown && breakdown.length > 1;
                    const tooltipHeight = hasBreakdown ? 48 + breakdown.length * 14 : 48;
                    const tooltipWidth = hasBreakdown ? 160 : 120;
                    const tooltipX = Math.max(pad.left, Math.min(pt.x - tooltipWidth / 2, width - pad.right - tooltipWidth));
                    const tooltipY = Math.max(pad.top, pt.y - tooltipHeight - 10);

                    return (
                        <g style={{ pointerEvents: "none" }}>
                            {/* Vertical line */}
                            <line
                                x1={pt.x}
                                y1={pad.top}
                                x2={pt.x}
                                y2={pad.top + ch}
                                stroke="#7c3aed"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                                opacity="0.4"
                            />
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
                            {/* Main value */}
                            <text
                                x={tooltipX + tooltipWidth / 2}
                                y={tooltipY + 16}
                                textAnchor="middle"
                                className="text-xs font-bold fill-white"
                            >
                                {formatVal(pt.value)}
                            </text>
                            {/* Full date */}
                            <text
                                x={tooltipX + tooltipWidth / 2}
                                y={tooltipY + 30}
                                textAnchor="middle"
                                className="text-[10px] fill-gray-400"
                            >
                                {pt.fullDate}
                            </text>
                            {/* Model breakdown */}
                            {hasBreakdown && breakdown.slice(0, 5).map((m, idx) => (
                                <text
                                    key={m.model}
                                    x={tooltipX + 8}
                                    y={tooltipY + 46 + idx * 14}
                                    className="text-[9px] fill-gray-300"
                                >
                                    {m.label.slice(0, 12)}: {formatVal(metric === "requests" ? m.requests : metric === "cost" ? m.cost : m.tokens)}
                                </text>
                            ))}
                            {hasBreakdown && breakdown.length > 5 && (
                                <text
                                    x={tooltipX + 8}
                                    y={tooltipY + 46 + 5 * 14}
                                    className="text-[9px] fill-gray-500"
                                >
                                    +{breakdown.length - 5} more...
                                </text>
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

type UsageGraphProps = {
    apiKeys?: ApiKeyInfo[];
};

// Map time range to approximate record limit (rough estimate based on usage patterns)
const getRecordLimit = (timeRange: TimeRange, customDays: number): number => {
    switch (timeRange) {
        case "24h": return 500;      // ~500 requests/day max
        case "7d": return 3500;      // ~500/day * 7
        case "30d": return 10000;    // cap at 10k
        case "all": return 10000;    // cap at 10k
        case "custom": return Math.min(customDays * 500, 10000);
    }
};

export const UsageGraph: FC<UsageGraphProps> = ({ apiKeys }) => {
    const keys: ApiKeyInfo[] = apiKeys || [];
    const [usage, setUsage] = useState<UsageRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchedRange, setFetchedRange] = useState<TimeRange | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState<FilterState>({
        timeRange: "24h",
        customDays: 14,
        metric: "requests",
        modality: "all",
        apiKey: null,
        selectedModels: [], // Empty means "All"
    });

    // Fetch usage data for the current time range
    const fetchUsage = (timeRange: TimeRange, customDays: number) => {
        const limit = getRecordLimit(timeRange, customDays);
        setLoading(true);
        setError(null);
        fetch(`/api/usage?format=json&limit=${limit}`)
            .then((r) => {
                if (!r.ok) throw new Error("Failed to fetch usage data");
                return r.json();
            })
            .then((data) => {
                setUsage(data?.usage || []);
                setFetchedRange(timeRange);
            })
            .catch((err) => {
                setError(err.message || "Failed to load usage data");
                setUsage([]);
            })
            .finally(() => setLoading(false));
    };

    // Lazy load: fetch data only when component comes into view
    useEffect(() => {
        if (fetchedRange || !containerRef.current) return;

        const container = containerRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !fetchedRange) {
                    fetchUsage("24h", filters.customDays);
                    observer.disconnect();
                }
            },
            { threshold: 0.1 } // Trigger when 10% visible
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [fetchedRange, filters.customDays]);

    // Re-fetch when time range changes to a larger range
    useEffect(() => {
        if (!fetchedRange) return; // Initial fetch not done yet

        // Only re-fetch if we need more data
        const rangeOrder = ["24h", "7d", "30d", "all", "custom"] as const;
        const currentIdx = rangeOrder.indexOf(fetchedRange);
        const newIdx = rangeOrder.indexOf(filters.timeRange);

        // Fetch if switching to a larger range, or if custom days increased
        if (newIdx > currentIdx ||
            (filters.timeRange === "custom" && fetchedRange === "custom" && filters.customDays > 14)) {
            fetchUsage(filters.timeRange, filters.customDays);
        }
    }, [filters.timeRange, filters.customDays, fetchedRange]);

    // Models that appear in usage data, enriched with registry display names
    const usedModels = useMemo(() => {
        const modelIds = new Set<string>();
        usage.forEach((r) => r.model && modelIds.add(r.model));

        return Array.from(modelIds)
            .map((id) => {
                const registered = ALL_MODELS.find((m) => m.id === id);
                return { id, label: registered?.label || id };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [usage]);

    // Helper to get tokens from a record
    const getRecordTokens = (r: UsageRecord) =>
        (r.input_text_tokens || 0) + (r.output_text_tokens || 0) +
        (r.input_audio_tokens || 0) + (r.output_audio_tokens || 0) +
        (r.input_image_tokens || 0) + (r.output_image_tokens || 0);

    // Filter and aggregate
    const { chartData, stats } = useMemo(() => {
        const now = new Date();
        const cutoff =
            filters.timeRange === "24h" ? new Date(now.getTime() - MS_PER_DAY) :
            filters.timeRange === "7d" ? new Date(now.getTime() - MS_PER_WEEK) :
            filters.timeRange === "30d" ? new Date(now.getTime() - MS_PER_30_DAYS) :
            filters.timeRange === "custom" ? new Date(now.getTime() - filters.customDays * MS_PER_DAY) :
            new Date(0);

        const filtered = usage.filter((r) => {
            const ts = new Date(r.timestamp);
            if (ts < cutoff) return false;
            if (filters.apiKey && r.api_key !== filters.apiKey) return false;
            // Multi-select: if selectedModels is empty, show all; otherwise filter by selected
            if (filters.selectedModels.length > 0 && r.model && !filters.selectedModels.includes(r.model)) return false;
            if (filters.modality !== "all") {
                const t = r.type?.toLowerCase();
                if (filters.modality === "text" && t !== "text" && t !== "chat") return false;
                if (filters.modality === "image" && t !== "image") return false;
                if (filters.modality === "audio" && t !== "audio") return false;
                if (filters.modality === "video" && t !== "video") return false;
            }
            return true;
        });

        const bucketSize = filters.timeRange === "24h" ? MS_PER_HOUR : MS_PER_DAY;
        type BucketData = {
            requests: number;
            cost: number;
            tokens: number;
            byModel: Map<string, { requests: number; cost: number; tokens: number }>;
        };
        const buckets = new Map<number, BucketData>();

        filtered.forEach((r) => {
            const key = Math.floor(new Date(r.timestamp).getTime() / bucketSize) * bucketSize;
            const cur = buckets.get(key) || { requests: 0, cost: 0, tokens: 0, byModel: new Map() };
            const tokens = getRecordTokens(r);
            cur.requests++;
            cur.cost += r.cost_usd || 0;
            cur.tokens += tokens;

            // Track per-model breakdown
            if (r.model) {
                const modelData = cur.byModel.get(r.model) || { requests: 0, cost: 0, tokens: 0 };
                modelData.requests++;
                modelData.cost += r.cost_usd || 0;
                modelData.tokens += tokens;
                cur.byModel.set(r.model, modelData);
            }
            buckets.set(key, cur);
        });

        const sorted = Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([ts, d]) => {
                const date = new Date(ts);
                // Build model breakdown for tooltip
                const modelBreakdown: ModelBreakdown[] = Array.from(d.byModel.entries())
                    .map(([modelId, stats]) => {
                        const registered = ALL_MODELS.find((m) => m.id === modelId);
                        return {
                            model: modelId,
                            label: registered?.label || modelId,
                            requests: stats.requests,
                            cost: stats.cost,
                            tokens: stats.tokens,
                        };
                    })
                    .sort((a, b) => b.requests - a.requests); // Sort by most requests

                return {
                    label: filters.timeRange === "24h"
                        ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    fullDate: filters.timeRange === "24h"
                        ? date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : date.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }),
                    value: d[filters.metric],
                    timestamp: date,
                    modelBreakdown,
                };
            });

        const totalReq = filtered.length;
        const totalCost = filtered.reduce((s, r) => s + (r.cost_usd || 0), 0);
        const totalTok = filtered.reduce((s, r) => s + getRecordTokens(r), 0);
        const avgTime = filtered.length
            ? filtered.reduce((s, r) => s + (r.response_time_ms || 0), 0) / filtered.length
            : 0;

        return {
            chartData: sorted,
            stats: { totalRequests: totalReq, totalCost, totalTokens: totalTok, avgResponseTime: avgTime },
        };
    }, [usage, filters]);

    const formatTokens = (n: number) =>
        n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toString();

    // Key options - show name first, fallback to masked key
    const keyOptions: SelectOption[] = [
        { value: null, label: "All Keys" },
        ...keys.map((k) => ({
            value: k.start || k.id,
            label: k.name || (k.start ? `${k.start}...` : k.id.slice(0, 8)),
        })),
    ];

    // Model options for multi-select
    const modelSelectOptions = usedModels.map((m) => ({ value: m.id, label: m.label }));

    // Show model breakdown in tooltip when multiple models are visible
    const showModelBreakdown = filters.selectedModels.length === 0 || filters.selectedModels.length > 1;

    return (
        <div ref={containerRef} className="flex flex-col gap-2">
            <h2 className="font-bold">Usage Analytics</h2>

            {/* Main card - matching existing violet theme */}
            <div className="bg-violet-50/30 rounded-2xl p-4 sm:p-6 border border-violet-300">
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
                            <p className="text-sm text-red-500 font-medium">{error}</p>
                            <button
                                onClick={() => fetchUsage(filters.timeRange, filters.customDays)}
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
                        {(["24h", "7d", "30d", "all"] as TimeRange[]).map((t) => (
                            <FilterButton key={t} active={filters.timeRange === t} onClick={() => setFilters((f) => ({ ...f, timeRange: t }))}>
                                {t === "24h" ? "24h" : t === "7d" ? "7 days" : t === "30d" ? "30 days" : "All"}
                            </FilterButton>
                        ))}
                        <FilterButton active={filters.timeRange === "custom"} onClick={() => setFilters((f) => ({ ...f, timeRange: "custom" }))}>
                            Custom
                        </FilterButton>
                        {filters.timeRange === "custom" && (
                            <div className="flex items-center gap-1.5 ml-1">
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={filters.customDays}
                                    onChange={(e) => setFilters((f) => ({ ...f, customDays: Math.max(1, Math.min(365, parseInt(e.target.value) || 1)) }))}
                                    className="w-14 px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white text-green-950 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 tabular-nums"
                                />
                                <span className="text-xs text-gray-500">days</span>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-1.5">
                        {(["requests", "cost", "tokens"] as Metric[]).map((m) => (
                            <FilterButton key={m} active={filters.metric === m} onClick={() => setFilters((f) => ({ ...f, metric: m }))}>
                                {m === "requests" ? "Requests" : m === "cost" ? "Cost" : "Tokens"}
                            </FilterButton>
                        ))}
                    </div>
                </div>

                {/* Filters Row 2: Modality + Dropdowns */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="flex flex-wrap gap-1.5">
                        {(["all", "text", "image", "audio", "video"] as Modality[]).map((m) => (
                            <FilterButton key={m} active={filters.modality === m} onClick={() => setFilters((f) => ({ ...f, modality: m }))}>
                                {m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
                            </FilterButton>
                        ))}
                    </div>
                    <div className="flex gap-2 ml-auto">
                        <Select options={keyOptions} value={filters.apiKey} onChange={(v) => setFilters((f) => ({ ...f, apiKey: v }))} placeholder="All Keys" />
                        <MultiSelect
                            options={modelSelectOptions}
                            selected={filters.selectedModels}
                            onChange={(v) => setFilters((f) => ({ ...f, selectedModels: v }))}
                            placeholder="All Models"
                        />
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 p-3 bg-white/50 rounded-xl border border-violet-200">
                    <Stat label="Requests" value={stats.totalRequests.toLocaleString()} />
                    <Stat label="Cost" value={`$${stats.totalCost.toFixed(4)}`} />
                    <Stat label="Tokens" value={formatTokens(stats.totalTokens)} />
                    <Stat label="Avg Time" value={`${stats.avgResponseTime.toFixed(0)}ms`} />
                </div>

                {/* Chart */}
                <div className="bg-white rounded-xl p-4 border border-violet-200">
                    <Chart data={chartData} metric={filters.metric} showModelBreakdown={showModelBreakdown} />
                </div>
                </>
                )}
            </div>
        </div>
    );
};

export default UsageGraph;
