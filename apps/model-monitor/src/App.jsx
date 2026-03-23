import { useState } from "react";
import { useModelMonitor } from "./hooks/useModelMonitor";

// ── Modality color map ──────────────────────────────────────────────
// primary (lavender) = image, secondary (periwinkle) = text,
// tertiary (mint) = audio, accent (lime) = video
const TYPE_COLORS = {
    image: {
        badge: "bg-primary-light text-dark border border-primary-strong",
        card: "bg-primary-light border-primary-strong",
        dot: "bg-primary-strong",
    },
    text: {
        badge: "bg-secondary-light text-dark border border-secondary-strong",
        card: "bg-secondary-light border-secondary-strong",
        dot: "bg-secondary-strong",
    },
    audio: {
        badge: "bg-tertiary-light text-dark border border-tertiary-strong",
        card: "bg-tertiary-light border-tertiary-strong",
        dot: "bg-tertiary-strong",
    },
    video: {
        badge: "bg-accent-light text-dark border border-accent-strong",
        card: "bg-accent-light border-accent-strong",
        dot: "bg-accent-strong",
    },
};

const fallbackColors = TYPE_COLORS.text;

function typeColor(type) {
    return TYPE_COLORS[type] || fallbackColors;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatPercent(count, total, showZero = false) {
    if (!total || total === 0) return "—";
    const pct = (count / total) * 100;
    if (pct === 0) return showZero ? "0%" : "—";
    return `${pct.toFixed(1)}%`;
}

function get2xxColor(ok2xx, total, excludedUserErrors = 0) {
    const adjustedTotal = total - excludedUserErrors;
    if (!adjustedTotal || adjustedTotal <= 0) return "text-border";
    if (ok2xx === 0) return "text-dark font-medium";
    const pct = (ok2xx / adjustedTotal) * 100;
    if (pct > 95) return "text-tertiary-strong font-medium";
    if (pct > 80) return "text-tertiary-strong";
    if (pct > 50) return "text-muted";
    return "text-dark font-medium";
}

function getLatencyColor(latencySec) {
    if (latencySec < 2) return "text-secondary-strong";
    if (latencySec < 5) return "text-tertiary-strong";
    if (latencySec < 10) return "text-muted";
    return "text-dark font-medium";
}

function computeHealthStatus(stats) {
    if (!stats || !stats.total_requests) return "on";
    const success = stats.status_2xx || 0;
    const total5xx = stats.total_5xx || 0;
    const modelRequests = success + total5xx;
    if (modelRequests < 3) return "on";
    const pct5xx = (total5xx / modelRequests) * 100;
    if (pct5xx >= 50) return "off";
    if (pct5xx >= 10) return "degraded";
    return "on";
}

// ── Health summary cards ─────────────────────────────────────────────

function GlobalHealthSummary({ models, typeFilter, onTypeFilter }) {
    const calcGroupStats = (group) => {
        let total2xx = 0;
        let total5xx = 0;
        let countOn = 0;
        let countDegraded = 0;
        let countOff = 0;

        for (const m of group) {
            const stats = m.stats;
            if (!stats) continue;
            total2xx += stats.status_2xx || 0;
            total5xx += stats.total_5xx || 0;
            const status = computeHealthStatus(stats);
            if (status === "on") countOn++;
            else if (status === "degraded") countDegraded++;
            else countOff++;
        }

        const modelRequests = total2xx + total5xx;
        const successRate =
            modelRequests > 0 ? (total2xx / modelRequests) * 100 : 100;

        let status = "healthy";
        if (successRate < 75) status = "critical";
        else if (successRate < 95) status = "degraded";

        return {
            successRate,
            status,
            countOn,
            countDegraded,
            countOff,
            totalModels: group.length,
        };
    };

    const statusLabel = {
        healthy: "Healthy",
        degraded: "Degraded",
        critical: "Critical",
    };

    const HealthCard = ({ title, type, stats }) => {
        const colors = typeColor(type);
        const isActive = typeFilter === type;
        const isDimmed = typeFilter !== null && !isActive;
        return (
            <button
                type="button"
                onClick={() => onTypeFilter(isActive ? null : type)}
                className={`${colors.card} border-r-4 border-b-4 p-3 cursor-pointer select-none text-left transition-all duration-100 ${
                    isActive
                        ? "translate-x-[3px] translate-y-[3px] shadow-none"
                        : "shadow-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                } ${isDimmed ? "opacity-35" : ""}`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-dark">
                        {title}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                    <span
                        className={`w-2 h-2 ${colors.dot} ${stats.status === "critical" ? "animate-pulse" : ""}`}
                    />
                    <span className="text-sm font-bold text-dark">
                        {statusLabel[stats.status]}
                    </span>
                </div>
                <div className="text-xs text-muted">
                    {stats.successRate.toFixed(1)}% success
                </div>
                <div className="text-[10px] text-subtle mt-1">
                    {stats.totalModels} models
                    {(stats.countDegraded > 0 || stats.countOff > 0) && (
                        <span className="ml-1">
                            (
                            {stats.countOff > 0 && (
                                <span className="font-bold text-dark">
                                    {stats.countOff} off
                                </span>
                            )}
                            {stats.countOff > 0 &&
                                stats.countDegraded > 0 &&
                                ", "}
                            {stats.countDegraded > 0 && (
                                <span className="font-bold text-muted">
                                    {stats.countDegraded} degraded
                                </span>
                            )}
                            )
                        </span>
                    )}
                </div>
            </button>
        );
    };

    if (models.length === 0) return null;

    const types = [
        { key: "text", title: "Text" },
        { key: "image", title: "Image" },
        { key: "video", title: "Video" },
        { key: "audio", title: "Audio" },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {types.map(({ key, title }) => {
                const group = models.filter((m) => m.type === key);
                if (group.length === 0) return null;
                return (
                    <HealthCard
                        key={key}
                        title={title}
                        type={key}
                        stats={calcGroupStats(group)}
                    />
                );
            })}
        </div>
    );
}

// ── Status badge ─────────────────────────────────────────────────────

function StatusBadge({ stats }) {
    const status = computeHealthStatus(stats);
    if (status === "on") return null;

    const styles = {
        off: "bg-status-off text-white border-status-off",
        degraded: "bg-status-degraded text-white border-status-degraded",
    };

    return (
        <span
            className={`inline-flex items-center px-1.5 py-0.5 text-[8px] border font-bold ${styles[status]} ${status === "off" ? "animate-pulse" : ""} uppercase tracking-wider`}
        >
            {status === "off" ? "OFF" : "DEGRADED"}
        </span>
    );
}

// ── Sortable header ──────────────────────────────────────────────────

function SortableTh({ label, sortKey, currentSort, onSort, align = "left" }) {
    const isActive = currentSort.key === sortKey;
    const arrow = isActive ? (currentSort.asc ? " ↑" : " ↓") : "";
    const alignClass =
        align === "right"
            ? "text-right"
            : align === "center"
              ? "text-center"
              : "text-left";

    return (
        <th
            className={`px-3 py-2 font-bold cursor-pointer hover:text-dark select-none uppercase tracking-wider ${alignClass}`}
            onClick={() => onSort(sortKey)}
        >
            {label}
            {arrow}
        </th>
    );
}

// ── Gateway health ───────────────────────────────────────────────────

function GatewayHealth({ stats }) {
    if (!stats || stats.length === 0) return null;

    const totals = stats.reduce(
        (acc, s) => ({
            requests: acc.requests + (s.total_requests || 0),
            err400: acc.err400 + (s.errors_400 || 0),
            err401: acc.err401 + (s.errors_401 || 0),
            err402: acc.err402 + (s.errors_402 || 0),
            err403: acc.err403 + (s.errors_403 || 0),
            err429: acc.err429 + (s.errors_429 || 0),
            err4xxOther: acc.err4xxOther + (s.errors_4xx_other || 0),
        }),
        {
            requests: 0,
            err400: 0,
            err401: 0,
            err402: 0,
            err403: 0,
            err429: 0,
            err4xxOther: 0,
        },
    );

    if (totals.requests === 0) return null;

    const total4xx =
        totals.err400 +
        totals.err401 +
        totals.err402 +
        totals.err403 +
        totals.err429 +
        totals.err4xxOther;
    if (total4xx === 0) return null;

    const fmtPct = (n) => {
        const p = totals.requests > 0 ? (n / totals.requests) * 100 : 0;
        if (p === 0) return "0%";
        return p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
    };

    const errors = [
        { code: "400", count: totals.err400, label: "Bad Request" },
        { code: "401", count: totals.err401, label: "No API Key" },
        { code: "402", count: totals.err402, label: "Billing" },
        { code: "403", count: totals.err403, label: "Access Denied" },
        { code: "429", count: totals.err429, label: "Rate Limited" },
        { code: "4xx", count: totals.err4xxOther, label: "Other" },
    ].filter((e) => e.count > 0);

    return (
        <div className="bg-tan border-r-4 border-b-4 border-border overflow-hidden">
            <div className="px-4 py-2 bg-border/50 border-b border-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-dark">
                            Auth & Validation
                        </span>
                        <span className="text-[10px] text-dark bg-cream px-1.5 py-0.5 border border-dark font-bold">
                            {fmtPct(total4xx)} rejected
                        </span>
                    </div>
                    <span className="text-xs text-muted">
                        {totals.requests} unresolved
                    </span>
                </div>
            </div>
            <div className="px-4 py-2 flex flex-wrap gap-3">
                {errors.map(({ code, count, label }) => (
                    <div
                        key={code}
                        className="flex items-center gap-2 bg-cream border border-border px-2 py-1"
                    >
                        <span className="text-xs font-mono font-bold text-dark">
                            {code}
                        </span>
                        <span className="text-xs font-bold text-muted">
                            {fmtPct(count)}
                        </span>
                        <span className="text-[10px] text-subtle">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main app ─────────────────────────────────────────────────────────

function App() {
    const [aggregationWindow, setAggregationWindow] = useState("60m");

    const WINDOW_OPTIONS = [
        { key: "7d", label: "7d" },
        { key: "24h", label: "24h" },
        { key: "60m", label: "1h" },
        { key: "5m", label: "5m" },
    ];
    const { models, gatewayStats, lastUpdated, error, tinybirdConfigured } =
        useModelMonitor(aggregationWindow);

    const [sort, setSort] = useState({ key: "requests", asc: false });
    const [typeFilter, setTypeFilter] = useState(null);

    const handleSort = (key) => {
        setSort((prev) => ({
            key,
            asc:
                prev.key === key ? !prev.asc : key === "name" || key === "type",
        }));
    };

    const sortedModels = [...models].sort((a, b) => {
        // Models with no traffic at all always sink to the bottom
        const aHasData = (a.stats?.total_requests || 0) > 0;
        const bHasData = (b.stats?.total_requests || 0) > 0;
        if (aHasData !== bHasData) return aHasData ? -1 : 1;

        const dir = sort.asc ? 1 : -1;
        switch (sort.key) {
            case "type":
                return dir * (a.type || "").localeCompare(b.type || "");
            case "name":
                return dir * (a.name || "").localeCompare(b.name || "");
            case "requests":
            case "share": {
                const aReqs =
                    (a.stats?.total_requests || 0) - (a.stats?.total_4xx || 0);
                const bReqs =
                    (b.stats?.total_requests || 0) - (b.stats?.total_4xx || 0);
                // Tiebreak: if both have 0 non-4xx, rank by total requests
                if (aReqs === bReqs) {
                    return (
                        dir *
                        ((a.stats?.total_requests || 0) -
                            (b.stats?.total_requests || 0))
                    );
                }
                return dir * (aReqs - bReqs);
            }
            case "ok2xx": {
                const aTotal2 =
                    (a.stats?.total_requests || 0) - (a.stats?.total_4xx || 0);
                const bTotal2 =
                    (b.stats?.total_requests || 0) - (b.stats?.total_4xx || 0);
                const aPct2 =
                    aTotal2 > 0 ? (a.stats?.status_2xx || 0) / aTotal2 : 0;
                const bPct2 =
                    bTotal2 > 0 ? (b.stats?.status_2xx || 0) / bTotal2 : 0;
                return dir * (aPct2 - bPct2);
            }
            case "errors":
                return (
                    dir *
                    ((a.stats?.total_5xx || 0) - (b.stats?.total_5xx || 0))
                );
            case "lastError": {
                const aTime =
                    a.stats?.last_error_at &&
                    a.stats.last_error_at !== "1970-01-01 00:00:00"
                        ? new Date(`${a.stats.last_error_at}Z`).getTime()
                        : 0;
                const bTime =
                    b.stats?.last_error_at &&
                    b.stats.last_error_at !== "1970-01-01 00:00:00"
                        ? new Date(`${b.stats.last_error_at}Z`).getTime()
                        : 0;
                return dir * (aTime - bTime);
            }
            case "p50":
                return (
                    dir *
                    ((a.stats?.latency_p50_ms || 0) -
                        (b.stats?.latency_p50_ms || 0))
                );
            case "avg":
                return (
                    dir *
                    ((a.stats?.avg_latency_ms || 0) -
                        (b.stats?.avg_latency_ms || 0))
                );
            case "p95":
                return (
                    dir *
                    ((a.stats?.latency_p95_ms || 0) -
                        (b.stats?.latency_p95_ms || 0))
                );
            case "user4xx": {
                const aTotal = a.stats?.total_requests || 1;
                const bTotal = b.stats?.total_requests || 1;
                const aPct = (a.stats?.total_4xx || 0) / aTotal;
                const bPct = (b.stats?.total_4xx || 0) / bTotal;
                return dir * (aPct - bPct);
            }
            default:
                return 0;
        }
    });

    const filteredModels = typeFilter
        ? sortedModels.filter((m) => m.type === typeFilter)
        : sortedModels;

    return (
        <div className="min-h-screen p-4 md:p-6 bg-cream">
            <div className="max-w-5xl mx-auto space-y-4">
                {/* Header */}
                <header className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-12 sm:mb-8">
                        <img
                            src="/bee-text-black.svg"
                            alt="pollinations.ai"
                            className="h-[7.5rem] -my-6"
                        />

                        <div className="flex items-center justify-center sm:justify-end gap-3">
                            {!tinybirdConfigured && (
                                <span className="text-xs text-dark bg-accent-light px-2 py-1 border border-accent-strong font-bold">
                                    Tinybird not configured
                                </span>
                            )}

                            {/* External links */}
                            <div className="flex items-center gap-1.5">
                                <a
                                    href="https://pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="pollinations.ai"
                                    className="p-1.5 border border-dark bg-white text-dark hover:bg-tan transition-colors border-r-2 border-b-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none hover:border-r hover:border-b active:translate-x-[2px] active:translate-y-[2px]"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <title>Website</title>
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M2 12h20" />
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                    </svg>
                                </a>
                                <a
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Dashboard"
                                    className="p-1.5 border border-dark bg-white text-dark hover:bg-tan transition-colors border-r-2 border-b-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none hover:border-r hover:border-b active:translate-x-[2px] active:translate-y-[2px]"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <title>Login</title>
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                        <polyline points="10 17 15 12 10 7" />
                                        <line x1="15" y1="12" x2="3" y2="12" />
                                    </svg>
                                </a>
                                <a
                                    href="https://discord.gg/pollinations-ai-885844321461485618"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Discord"
                                    className="p-1.5 border border-dark bg-white text-dark hover:bg-tan transition-colors border-r-2 border-b-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none hover:border-r hover:border-b active:translate-x-[2px] active:translate-y-[2px]"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <title>Discord</title>
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
                                    </svg>
                                </a>
                                <a
                                    href="https://github.com/pollinations/pollinations"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="GitHub"
                                    className="p-1.5 border border-dark bg-white text-dark hover:bg-tan transition-colors border-r-2 border-b-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none hover:border-r hover:border-b active:translate-x-[2px] active:translate-y-[2px]"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <title>GitHub</title>
                                        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="text-xs text-subtle flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-dark uppercase tracking-wider">
                            📡 model monitor
                        </span>
                        <span className="text-border mx-0.5">·</span>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span>window:</span>
                            <div
                                className="inline-flex border border-dark overflow-hidden"
                                title="Longer windows are more stable. 5m is live but noisier."
                            >
                                {WINDOW_OPTIONS.map(({ key, label }, i) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() =>
                                            setAggregationWindow(key)
                                        }
                                        className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                            i > 0 ? "border-l border-dark" : ""
                                        } ${
                                            aggregationWindow === key
                                                ? key === "5m"
                                                    ? "bg-accent-strong text-dark"
                                                    : "bg-dark text-white"
                                                : "bg-cream text-muted hover:bg-tan"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </span>
                        <span className="text-border mx-1">·</span>
                        <span className="whitespace-nowrap">
                            last update:{" "}
                            {lastUpdated?.toLocaleTimeString("en-GB", {
                                timeZone: "UTC",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            }) || "—"}{" "}
                            UTC
                        </span>
                    </div>
                </header>

                {/* Error banner */}
                {error && (
                    <div className="px-3 py-2 bg-cream border-r-4 border-b-4 border-dark text-xs text-dark font-bold">
                        {error}
                    </div>
                )}

                {/* Global Health Summary */}
                <GlobalHealthSummary
                    models={models}
                    typeFilter={typeFilter}
                    onTypeFilter={setTypeFilter}
                />

                {/* Gateway Health (pre-model errors) */}
                <GatewayHealth stats={gatewayStats} />

                {/* Model Table */}
                <div className="border border-dark bg-white border-r-4 border-b-4 overflow-x-auto shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-tan text-[10px] text-muted">
                            <tr>
                                <SortableTh
                                    label="Model"
                                    sortKey="name"
                                    currentSort={sort}
                                    onSort={handleSort}
                                />
                                <SortableTh
                                    label="Reqs (+4xx)"
                                    sortKey="requests"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="Success"
                                    sortKey="ok2xx"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="5xx"
                                    sortKey="errors"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="4xx"
                                    sortKey="user4xx"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="Avg"
                                    sortKey="avg"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="P95"
                                    sortKey="p95"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-tan">
                            {filteredModels.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="p-8 text-center text-subtle"
                                    >
                                        {lastUpdated
                                            ? "No models found"
                                            : "Loading models..."}
                                    </td>
                                </tr>
                            ) : (
                                filteredModels.map((model) => {
                                    const stats = model.stats;
                                    const total = stats?.total_requests || 0;
                                    const total5xx = stats?.total_5xx || 0;
                                    const total4xx = stats?.total_4xx || 0;
                                    const pct4xx =
                                        total > 0
                                            ? (total4xx / total) * 100
                                            : 0;
                                    const avgSec = stats?.avg_latency_ms
                                        ? stats.avg_latency_ms / 1000
                                        : null;
                                    const p95Sec = stats?.latency_p95_ms
                                        ? stats.latency_p95_ms / 1000
                                        : null;
                                    const colors = typeColor(model.type);
                                    const health = computeHealthStatus(stats);
                                    const rowBg =
                                        health === "off"
                                            ? "bg-status-off-light"
                                            : health === "degraded"
                                              ? "bg-status-degraded-light"
                                              : "";

                                    return (
                                        <tr
                                            key={`${model.type}-${model.name}`}
                                            className={`hover:bg-cream/50 ${rowBg}`}
                                        >
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${colors.badge}`}
                                                    >
                                                        {model.type}
                                                    </span>
                                                    <span className="text-dark font-medium">
                                                        {model.name}
                                                    </span>
                                                    {model.description && (
                                                        <span className="text-subtle text-[11px]">
                                                            {
                                                                model.description.split(
                                                                    " - ",
                                                                )[0]
                                                            }
                                                        </span>
                                                    )}
                                                    <StatusBadge
                                                        stats={stats}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-muted">
                                                {total > 0 ? (
                                                    <>
                                                        {(
                                                            total - total4xx
                                                        ).toLocaleString()}
                                                        {total4xx > 0 && (
                                                            <span className="text-subtle text-xs ml-1">
                                                                (
                                                                {total.toLocaleString()}
                                                                )
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${get2xxColor(
                                                    stats?.status_2xx || 0,
                                                    total - total4xx,
                                                    0,
                                                )}`}
                                            >
                                                {formatPercent(
                                                    stats?.status_2xx || 0,
                                                    total - total4xx,
                                                    true,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {total5xx > 0 ? (
                                                    <span className="text-dark font-bold">
                                                        {total5xx}
                                                    </span>
                                                ) : (
                                                    <span className="text-border">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-subtle">
                                                {pct4xx > 0
                                                    ? pct4xx < 1
                                                        ? `${pct4xx.toFixed(1)}%`
                                                        : `${Math.round(pct4xx)}%`
                                                    : "—"}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    avgSec
                                                        ? getLatencyColor(
                                                              avgSec,
                                                          )
                                                        : "text-border"
                                                }`}
                                            >
                                                {avgSec
                                                    ? `${avgSec.toFixed(1)}s`
                                                    : "—"}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    p95Sec
                                                        ? getLatencyColor(
                                                              p95Sec,
                                                          )
                                                        : "text-border"
                                                }`}
                                            >
                                                {p95Sec
                                                    ? `${p95Sec.toFixed(1)}s`
                                                    : "—"}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default App;
