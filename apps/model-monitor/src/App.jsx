import { useEffect, useState } from "react";
import { useModelMonitor } from "./hooks/useModelMonitor";

// Helper to format percentage
function formatPercent(count, total, showZero = false) {
    if (!total || total === 0) return "—";
    const pct = (count / total) * 100;
    if (pct === 0) return showZero ? "0%" : "—";
    return pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

// Helper to get 2xx color (excludes all 4xx from total since those are user errors)
function get2xxColor(ok2xx, total, excludedUserErrors = 0) {
    const adjustedTotal = total - excludedUserErrors;
    if (!adjustedTotal || adjustedTotal <= 0) return "text-gray-300";
    if (ok2xx === 0) return "text-red-600 font-medium"; // 0% success = red
    const pct = (ok2xx / adjustedTotal) * 100;
    if (pct > 95) return "text-green-600 font-medium";
    if (pct > 80) return "text-green-500";
    if (pct > 50) return "text-yellow-500";
    return "text-red-500";
}

// Helper to get latency color
function getLatencyColor(latencySec) {
    if (latencySec < 2) return "text-blue-600";
    if (latencySec < 5) return "text-green-600";
    if (latencySec < 10) return "text-yellow-600";
    return "text-red-600";
}

// Compute health status from stats
// Simple: based only on 5xx error rate (excludes 4xx user errors)
function computeHealthStatus(stats) {
    if (!stats || !stats.total_requests) return "on";

    const total = stats.total_requests;
    // Exclude all 4xx - these are user errors, not model failures
    const userErrors =
        (stats.errors_400 || 0) +
        (stats.errors_401 || 0) +
        (stats.errors_403 || 0) +
        (stats.errors_429 || 0);
    const adjustedTotal = total - userErrors;

    // If all requests were user errors, model is healthy
    if (adjustedTotal <= 0) return "on";

    const err5xx =
        (stats.errors_500 || 0) +
        (stats.errors_502 || 0) +
        (stats.errors_503 || 0) +
        (stats.errors_504 || 0);
    const pct5xx = (err5xx / adjustedTotal) * 100;
    const count2xx = stats.status_2xx || 0;

    // OFF: 5xx >= 20% or no successful requests
    if (pct5xx >= 20) return "off";
    if (count2xx === 0 && adjustedTotal > 0) return "off";

    // DEGRADED: 5xx 5-20%
    if (pct5xx >= 5) return "turbulent";

    return "on";
}

// Global health summary component
function GlobalHealthSummary({ models }) {
    // Separate by type
    const textModels = models.filter((m) => m.type === "text");
    const imageModels = models.filter((m) => m.type === "image");

    // Calculate aggregate stats for a group of models
    const calcGroupStats = (group) => {
        let total2xx = 0;
        let totalAdjusted = 0;
        let countOn = 0;
        let countTurbulent = 0;
        let countOff = 0;

        group.forEach((m) => {
            const stats = m.stats;
            if (!stats) return;

            const total = stats.total_requests || 0;
            // Exclude all 4xx user errors
            const userErrors =
                (stats.errors_400 || 0) +
                (stats.errors_401 || 0) +
                (stats.errors_403 || 0) +
                (stats.errors_429 || 0);
            const adjusted = total - userErrors;

            total2xx += stats.status_2xx || 0;
            totalAdjusted += adjusted > 0 ? adjusted : 0;

            const status = computeHealthStatus(stats);
            if (status === "on") countOn++;
            else if (status === "turbulent") countTurbulent++;
            else countOff++;
        });

        const successRate =
            totalAdjusted > 0 ? (total2xx / totalAdjusted) * 100 : 100;

        // Determine aggregate status based on success rate (traffic-weighted)
        let status = "healthy";
        if (successRate < 75) status = "critical";
        else if (successRate < 95) status = "degraded";

        return {
            successRate,
            status,
            countOn,
            countTurbulent,
            countOff,
            totalModels: group.length,
        };
    };

    const textStats = calcGroupStats(textModels);
    const imageStats = calcGroupStats(imageModels);

    const statusStyles = {
        healthy: {
            bg: "bg-green-50",
            border: "border-green-200",
            dot: "bg-green-500",
            text: "text-green-700",
            label: "Healthy",
        },
        degraded: {
            bg: "bg-yellow-50",
            border: "border-yellow-200",
            dot: "bg-yellow-500",
            text: "text-yellow-700",
            label: "Degraded",
        },
        critical: {
            bg: "bg-red-50",
            border: "border-red-200",
            dot: "bg-red-500 animate-pulse",
            text: "text-red-700",
            label: "Critical",
        },
    };

    const HealthCard = ({ title, emoji, stats }) => {
        const style = statusStyles[stats.status];
        return (
            <div
                className={`flex-1 min-w-[140px] ${style.bg} ${style.border} border rounded-lg p-3`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{emoji}</span>
                    <span className="text-xs font-medium text-gray-700">
                        {title}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className={`text-sm font-semibold ${style.text}`}>
                        {style.label}
                    </span>
                </div>
                <div className="text-xs text-gray-600">
                    {stats.successRate.toFixed(1)}% success
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                    {stats.totalModels} models
                    {(stats.countTurbulent > 0 || stats.countOff > 0) && (
                        <span className="ml-1">
                            (
                            {stats.countOff > 0 && (
                                <span className="text-red-600">
                                    {stats.countOff} off
                                </span>
                            )}
                            {stats.countOff > 0 &&
                                stats.countTurbulent > 0 &&
                                ", "}
                            {stats.countTurbulent > 0 && (
                                <span className="text-yellow-600">
                                    {stats.countTurbulent} degraded
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

    return (
        <div className="flex flex-wrap gap-3">
            <HealthCard title="Text" emoji="📝" stats={textStats} />
            <HealthCard title="Image" emoji="🖼️" stats={imageStats} />
        </div>
    );
}

// Status badge for model health (off/turbulent/on)
function StatusBadge({ stats }) {
    const status = computeHealthStatus(stats);
    if (status === "on") return null;

    const styles = {
        off: "bg-red-100 text-red-700 border-red-300",
        turbulent: "bg-yellow-100 text-yellow-700 border-yellow-300",
    };

    const labels = {
        off: "OFF",
        turbulent: "DEGRADED",
    };

    return (
        <span
            className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold border ${
                styles[status]
            } ${status === "off" ? "animate-pulse" : ""}`}
        >
            {labels[status]}
        </span>
    );
}

// Sortable table header
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
            className={`px-3 py-2 font-medium cursor-pointer hover:text-gray-700 select-none ${alignClass}`}
            onClick={() => onSort(sortKey)}
        >
            {label}
            {arrow}
        </th>
    );
}

// Gateway health summary (requests that failed before reaching a model)
function GatewayHealth({ stats }) {
    if (!stats || stats.length === 0) return null;

    // Aggregate across image and text - only 4xx (gateway/auth errors)
    const totals = stats.reduce(
        (acc, s) => ({
            requests: acc.requests + (s.total_requests || 0),
            err401: acc.err401 + (s.errors_401 || 0),
            err403: acc.err403 + (s.errors_403 || 0),
            err429: acc.err429 + (s.errors_429 || 0),
            err4xxOther: acc.err4xxOther + (s.errors_4xx_other || 0),
        }),
        { requests: 0, err401: 0, err403: 0, err429: 0, err4xxOther: 0 },
    );

    if (totals.requests === 0) return null;

    const total4xx =
        totals.err401 + totals.err403 + totals.err429 + totals.err4xxOther;
    if (total4xx === 0) return null;

    const pct = (n) => (totals.requests > 0 ? (n / totals.requests) * 100 : 0);
    const fmtPct = (n) => {
        const p = pct(n);
        if (p === 0) return "0%";
        return p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
    };

    // Only 4xx errors - these are auth/validation failures
    const errors = [
        { code: "401", count: totals.err401, label: "No API Key" },
        { code: "403", count: totals.err403, label: "No Pollen" },
        { code: "429", count: totals.err429, label: "Rate Limited" },
        { code: "4xx", count: totals.err4xxOther, label: "Bad Request" },
    ].filter((e) => e.count > 0);

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-amber-800">
                            🔐 Auth & Validation
                        </span>
                        <span className="text-[10px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-medium">
                            {fmtPct(total4xx)} rejected
                        </span>
                    </div>
                    <span className="text-xs text-amber-600">
                        {totals.requests} unresolved requests
                    </span>
                </div>
            </div>
            <div className="px-4 py-2 flex flex-wrap gap-3">
                {errors.map(({ code, count, label }) => (
                    <div
                        key={code}
                        className="flex items-center gap-2 bg-white border border-amber-200 rounded px-2 py-1"
                    >
                        <span className="text-xs font-mono font-bold text-amber-700">
                            {code}
                        </span>
                        <span className="text-xs font-medium text-amber-700">
                            {fmtPct(count)}
                        </span>
                        <span className="text-[10px] text-gray-500">
                            {label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function App() {
    const [aggregationWindow, setAggregationWindow] = useState("60m"); // Default: 60m (stable)
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

    const [sort, setSort] = useState({ key: "requests", asc: false }); // Default: highest request count first
    const [countdown, setCountdown] = useState(pollInterval / 1000);

    // Countdown timer for auto-refresh
    useEffect(() => {
        // Reset countdown when data refreshes
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

    // Sort models
    const sortedModels = [...models].sort((a, b) => {
        const dir = sort.asc ? 1 : -1;
        switch (sort.key) {
            case "type":
                return dir * (a.type || "").localeCompare(b.type || "");
            case "name":
                return dir * (a.name || "").localeCompare(b.name || "");
            case "requests":
            case "share":
                return (
                    dir *
                    ((a.stats?.total_requests || 0) -
                        (b.stats?.total_requests || 0))
                );
            case "ok2xx":
                return dir * (get2xx(a.stats) - get2xx(b.stats));
            case "errors":
                return (
                    dir *
                    ((a.stats?.total_errors || 0) -
                        (b.stats?.total_errors || 0))
                );
            case "lastError": {
                // Sort by timestamp, most recent first
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
            default:
                return 0;
        }
    });

    return (
        <div className="min-h-screen p-4 md:p-6 bg-gray-50">
            <div className="max-w-5xl mx-auto space-y-4">
                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                                pollinations.ai model monitor
                            </h1>
                            {isLiveMode && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200"
                                    title="Live mode shows 5-minute data. More volatile than standard view."
                                >
                                    <span>⚡</span>
                                    <span>Live (noisy)</span>
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            <span>
                                {isLiveMode ? "5-minute" : "60-minute"} window
                            </span>
                            <span className="flex items-center gap-1">
                                <span
                                    className={`inline-block w-2 h-2 rounded-full ${
                                        endpointStatus.image === true
                                            ? "bg-green-500"
                                            : endpointStatus.image === false
                                              ? "bg-red-500"
                                              : "bg-gray-300"
                                    }`}
                                />
                                image:{" "}
                                {
                                    sortedModels.filter(
                                        (m) => m.type === "image",
                                    ).length
                                }
                            </span>
                            <span className="flex items-center gap-1">
                                <span
                                    className={`inline-block w-2 h-2 rounded-full ${
                                        endpointStatus.text === true
                                            ? "bg-green-500"
                                            : endpointStatus.text === false
                                              ? "bg-red-500"
                                              : "bg-gray-300"
                                    }`}
                                />
                                text:{" "}
                                {
                                    sortedModels.filter(
                                        (m) => m.type === "text",
                                    ).length
                                }
                            </span>
                            <span>
                                Updated:{" "}
                                {lastUpdated?.toLocaleTimeString() || "—"}
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Aggregation Window Segmented Control */}
                        <div
                            className="inline-flex rounded border border-gray-300 overflow-hidden"
                            title="60m is more stable. 5m is faster but noisier."
                        >
                            <button
                                type="button"
                                onClick={() => setAggregationWindow("60m")}
                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    !isLiveMode
                                        ? "bg-gray-700 text-white"
                                        : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                60m
                            </button>
                            <button
                                type="button"
                                onClick={() => setAggregationWindow("5m")}
                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-gray-300 ${
                                    isLiveMode
                                        ? "bg-amber-500 text-white"
                                        : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                ⚡ 5m
                            </button>
                        </div>

                        {!tinybirdConfigured && (
                            <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                Tinybird not configured
                            </span>
                        )}

                        {/* Countdown indicator */}
                        <span className="text-[10px] text-gray-400 tabular-nums font-mono">
                            {countdown}s
                        </span>

                        <button
                            type="button"
                            onClick={refresh}
                            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                        >
                            Refresh
                        </button>
                    </div>
                </header>

                {/* Error banner */}
                {error && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                        {error}
                    </div>
                )}

                {/* Global Health Summary */}
                <GlobalHealthSummary models={models} />

                {/* Gateway Health (pre-model errors) */}
                <GatewayHealth stats={gatewayStats} />

                {/* Model Table */}
                <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                            <tr>
                                <SortableTh
                                    label="Model"
                                    sortKey="name"
                                    currentSort={sort}
                                    onSort={handleSort}
                                />
                                <SortableTh
                                    label="Reqs"
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
                                    label="Errors"
                                    sortKey="errors"
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
                        <tbody className="divide-y divide-gray-100">
                            {sortedModels.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="p-8 text-center text-gray-400"
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
                                    const userErrors =
                                        (stats?.errors_400 || 0) +
                                        (stats?.errors_401 || 0) +
                                        (stats?.errors_403 || 0) +
                                        (stats?.errors_429 || 0);
                                    const adjustedTotal = total - userErrors;
                                    const ok2xx = stats?.status_2xx || 0;
                                    const err5xx =
                                        (stats?.errors_500 || 0) +
                                        (stats?.errors_502 || 0) +
                                        (stats?.errors_503 || 0) +
                                        (stats?.errors_504 || 0);
                                    const avgSec = stats?.avg_latency_ms
                                        ? stats.avg_latency_ms / 1000
                                        : null;
                                    const p95Sec = stats?.latency_p95_ms
                                        ? stats.latency_p95_ms / 1000
                                        : null;

                                    return (
                                        <tr
                                            key={`${model.type}-${model.name}`}
                                            className="hover:bg-gray-50"
                                        >
                                            {/* Model name with type badge */}
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                                            model.type ===
                                                            "image"
                                                                ? "bg-purple-100 text-purple-700"
                                                                : "bg-blue-100 text-blue-700"
                                                        }`}
                                                    >
                                                        {model.type}
                                                    </span>
                                                    <span className="text-gray-900 font-medium">
                                                        {model.name}
                                                    </span>
                                                    <StatusBadge
                                                        stats={stats}
                                                    />
                                                </div>
                                            </td>
                                            {/* Requests */}
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                                {total > 0
                                                    ? total.toLocaleString()
                                                    : "—"}
                                            </td>
                                            {/* Success */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${get2xxColor(
                                                    ok2xx,
                                                    total,
                                                    userErrors,
                                                )}`}
                                            >
                                                {formatPercent(
                                                    ok2xx,
                                                    adjustedTotal,
                                                    true,
                                                )}
                                            </td>
                                            {/* 5xx Errors - simple count */}
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {err5xx > 0 ? (
                                                    <span className="text-red-600">
                                                        {err5xx}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            {/* Avg */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    avgSec
                                                        ? getLatencyColor(
                                                              avgSec,
                                                          )
                                                        : "text-gray-300"
                                                }`}
                                            >
                                                {avgSec
                                                    ? `${avgSec.toFixed(1)}s`
                                                    : "—"}
                                            </td>
                                            {/* P95 */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    p95Sec
                                                        ? getLatencyColor(
                                                              p95Sec,
                                                          )
                                                        : "text-gray-300"
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

                {/* Simple Legend */}
                <div className="text-[10px] text-gray-400 text-center">
                    <span className="inline-block px-1 py-0.5 rounded text-[8px] font-bold bg-red-100 text-red-700 border border-red-300 mr-1">
                        OFF
                    </span>
                    5xx ≥ 20%
                    <span className="mx-3">•</span>
                    <span className="inline-block px-1 py-0.5 rounded text-[8px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-300 mr-1">
                        DEGRADED
                    </span>
                    5xx ≥ 5%
                </div>
            </div>
        </div>
    );
}

export default App;
