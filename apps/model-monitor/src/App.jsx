import { useEffect, useState } from "react";
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

function get2xx(stats) {
    return stats?.status_2xx || 0;
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

function GlobalHealthSummary({ models }) {
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
        return (
            <div
                className={`flex-1 min-w-[140px] ${colors.card} border-r-4 border-b-4 p-3`}
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
            </div>
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
        <div className="flex flex-wrap gap-3">
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
    const isLiveMode = aggregationWindow === "5m";

    const {
        models,
        gatewayStats,
        refresh,
        pollInterval,
        lastUpdated,
        error,
        tinybirdConfigured,
        endpointStatus,
    } = useModelMonitor(aggregationWindow);

    const [sort, setSort] = useState({ key: "requests", asc: false });
    const [countdown, setCountdown] = useState(pollInterval / 1000);

    useEffect(() => {
        setCountdown(pollInterval / 1000);
        const timer = setInterval(() => {
            setCountdown((prev) => (prev > 0 ? prev - 1 : pollInterval / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [pollInterval]);

    const handleSort = (key) => {
        setSort((prev) => ({
            key,
            asc: prev.key === key ? !prev.asc : true,
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
            case "ok2xx":
                return dir * (get2xx(a.stats) - get2xx(b.stats));
            case "errors":
                return (
                    dir *
                    ((a.stats?.total_errors || 0) -
                        (b.stats?.total_errors || 0))
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

    // Endpoint status indicators
    const endpoints = [
        { key: "text", label: "text" },
        { key: "image", label: "image" },
        { key: "audio", label: "audio" },
    ];

    return (
        <div className="min-h-screen p-4 md:p-6 bg-cream">
            <div className="max-w-5xl mx-auto space-y-4">
                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <img
                                src="/bee-text-black.svg"
                                alt="pollinations.ai"
                                className="h-[7.5rem]"
                            />
                            <span className="text-lg font-bold text-dark uppercase tracking-wider">
                                model monitor
                            </span>
                            {isLiveMode && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-accent-light text-dark border border-accent-strong uppercase tracking-wider"
                                    title="Live mode shows 5-minute data. More volatile than standard view."
                                >
                                    Live (noisy)
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-subtle flex items-center gap-2 flex-wrap mt-1">
                            <span>
                                {isLiveMode ? "5-minute" : "60-minute"} window
                            </span>
                            {endpoints.map(({ key, label }) => (
                                <span
                                    key={key}
                                    className="flex items-center gap-1"
                                >
                                    <span
                                        className={`inline-block w-2 h-2 ${
                                            endpointStatus[key] === true
                                                ? typeColor(key).dot
                                                : endpointStatus[key] === false
                                                  ? "bg-dark"
                                                  : "bg-border"
                                        }`}
                                    />
                                    {label}:{" "}
                                    {
                                        sortedModels.filter(
                                            (m) =>
                                                m.type === key ||
                                                (key === "image" &&
                                                    m.type === "video"),
                                        ).length
                                    }
                                </span>
                            ))}
                            <span>
                                Updated:{" "}
                                {lastUpdated?.toLocaleTimeString() || "—"}
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Aggregation toggle */}
                        <div
                            className="inline-flex border border-dark overflow-hidden"
                            title="60m is more stable. 5m is faster but noisier."
                        >
                            <button
                                type="button"
                                onClick={() => setAggregationWindow("60m")}
                                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                    !isLiveMode
                                        ? "bg-dark text-white"
                                        : "bg-cream text-muted hover:bg-tan"
                                }`}
                            >
                                60m
                            </button>
                            <button
                                type="button"
                                onClick={() => setAggregationWindow("5m")}
                                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors border-l border-dark ${
                                    isLiveMode
                                        ? "bg-accent-strong text-dark"
                                        : "bg-cream text-muted hover:bg-tan"
                                }`}
                            >
                                5m
                            </button>
                        </div>

                        {!tinybirdConfigured && (
                            <span className="text-xs text-dark bg-accent-light px-2 py-1 border border-accent-strong font-bold">
                                Tinybird not configured
                            </span>
                        )}

                        <span className="text-[10px] text-subtle tabular-nums font-mono">
                            {countdown}s
                        </span>

                        <button
                            type="button"
                            onClick={refresh}
                            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-dark bg-white text-dark hover:bg-tan transition-colors border-r-2 border-b-2"
                        >
                            Refresh
                        </button>
                    </div>
                </header>

                {/* Error banner */}
                {error && (
                    <div className="px-3 py-2 bg-cream border-r-4 border-b-4 border-dark text-xs text-dark font-bold">
                        {error}
                    </div>
                )}

                {/* Global Health Summary */}
                <GlobalHealthSummary models={models} />

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
                            {sortedModels.length === 0 ? (
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
                                sortedModels.map((model) => {
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

                {/* Legend */}
                <div className="text-[10px] text-subtle text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[8px] font-bold bg-status-off text-white border border-status-off mr-1 uppercase tracking-wider">
                        OFF
                    </span>
                    5xx ≥ 50%
                    <span className="mx-3">·</span>
                    <span className="inline-block px-1.5 py-0.5 text-[8px] font-bold bg-status-degraded text-white border border-status-degraded mr-1 uppercase tracking-wider">
                        DEGRADED
                    </span>
                    5xx ≥ 10%
                </div>
            </div>
        </div>
    );
}

export default App;
