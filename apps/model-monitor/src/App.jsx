import { useState, useEffect } from "react";
import { useModelMonitor } from "./hooks/useModelMonitor";

// Helper to format percentage
function formatPercent(count, total, showZero = false) {
    if (!total || total === 0) return "—";
    const pct = (count / total) * 100;
    if (pct === 0) return showZero ? "0%" : "—";
    return pct < 1 ? pct.toFixed(1) + "%" : Math.round(pct) + "%";
}

// Helper to get 2xx color
function get2xxColor(ok2xx, total) {
    if (!total) return "text-gray-300";
    if (ok2xx === 0) return "text-red-600 font-medium"; // 0% success = red
    const pct = (ok2xx / total) * 100;
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

// Format relative time (e.g., "2m ago", "30s ago")
function formatTimeAgo(timestamp) {
    if (!timestamp || timestamp === "1970-01-01 00:00:00") return null;
    const date = new Date(timestamp + "Z"); // Add Z for UTC
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h`;
}

// Get color for "last error" based on recency
function getLastErrorColor(timestamp) {
    if (!timestamp || timestamp === "1970-01-01 00:00:00")
        return "text-gray-300";
    const date = new Date(timestamp + "Z");
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 30) return "text-red-600 font-medium";
    if (diffSec < 120) return "text-yellow-600";
    return "text-green-600";
}

// Error badge component - double-sided pill style like type badges
function ErrorBadges({ stats }) {
    // All error types with specific colors
    const errorTypes = [
        // 4xx client errors
        {
            code: "400",
            count: stats?.errors_400,
            bg: "bg-yellow-100",
            text: "text-yellow-800",
        },
        {
            code: "401",
            count: stats?.errors_401,
            bg: "bg-orange-100",
            text: "text-orange-800",
        },
        {
            code: "403",
            count: stats?.errors_403,
            bg: "bg-amber-100",
            text: "text-amber-800",
        }, // No pollen
        {
            code: "429",
            count: stats?.errors_429,
            bg: "bg-orange-200",
            text: "text-orange-900",
        }, // Rate limit
        // 5xx server errors
        {
            code: "500",
            count: stats?.errors_500,
            bg: "bg-red-100",
            text: "text-red-800",
        }, // Server error
        {
            code: "502",
            count: stats?.errors_502,
            bg: "bg-red-200",
            text: "text-red-900",
        }, // Bad gateway
        {
            code: "503",
            count: stats?.errors_503,
            bg: "bg-rose-100",
            text: "text-rose-800",
        }, // Unavailable
        {
            code: "504",
            count: stats?.errors_504,
            bg: "bg-pink-100",
            text: "text-pink-800",
        }, // Timeout
    ];

    const badges = errorTypes.filter((e) => e.count > 0);

    if (badges.length === 0) return <span className="text-gray-300">—</span>;

    // Double-sided pills like type badges
    return (
        <div className="flex flex-wrap gap-1">
            {badges.map(({ code, count, bg, text }) => (
                <span
                    key={code}
                    className="inline-flex items-stretch rounded overflow-hidden border border-gray-300"
                    title={`${code}: ${count} errors`}
                >
                    {/* Left: colored code */}
                    <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium ${bg} ${text}`}
                    >
                        {code}
                    </span>
                    {/* Right: count on white */}
                    <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold ${text} bg-white`}
                    >
                        {count}
                    </span>
                </span>
            ))}
        </div>
    );
}

// Trend indicator component
function TrendIndicator({ trend }) {
    if (!trend) return <span className="text-gray-300 text-[10px]">—</span>;

    const { p95Change, err5xxChange } = trend;

    // P95 trend - very low thresholds since 5-min windows overlap ~95%
    const p95Arrow = p95Change > 0.5 ? "▲" : p95Change < -0.5 ? "▼" : "—";
    const p95Color =
        p95Change > 5
            ? "text-red-600"
            : p95Change > 0.5
            ? "text-yellow-600"
            : p95Change < -0.5
            ? "text-green-600"
            : "text-gray-400";

    // 5xx trend - any change matters
    const err5xxArrow =
        err5xxChange > 0.1 ? "▲" : err5xxChange < -0.1 ? "▼" : "—";
    const err5xxColor =
        err5xxChange > 1
            ? "text-red-600"
            : err5xxChange > 0.1
            ? "text-yellow-600"
            : err5xxChange < -0.1
            ? "text-green-600"
            : "text-gray-400";

    // Format the change value for display
    const formatChange = (val) => {
        if (Math.abs(val) < 0.1) return "";
        return `${val > 0 ? "+" : ""}${
            Math.abs(val) < 1 ? val.toFixed(1) : Math.round(val)
        }%`;
    };

    return (
        <div className="flex gap-1 text-[11px] justify-center">
            <span
                className={p95Color}
                title={`P95: ${p95Change > 0 ? "+" : ""}${p95Change.toFixed(
                    0
                )}%`}
            >
                {p95Arrow}
                {formatChange(p95Change)}
            </span>
            <span className="text-gray-300">|</span>
            <span
                className={err5xxColor}
                title={`5xx: ${
                    err5xxChange > 0 ? "+" : ""
                }${err5xxChange.toFixed(1)}%`}
            >
                {err5xxArrow}
                {formatChange(err5xxChange)}
            </span>
        </div>
    );
}

// Mini sparkline component
function Sparkline({ data, color = "blue" }) {
    if (!data || data.length < 2)
        return <span className="text-gray-300 text-[10px]">—</span>;

    const values = data.map((d) => d.p95);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const width = 50;
    const height = 16;
    const points = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * width;
            const y = height - ((v - min) / range) * height;
            return `${x},${y}`;
        })
        .join(" ");

    const colorMap = {
        blue: "stroke-blue-400",
        red: "stroke-red-400",
        green: "stroke-green-400",
    };

    return (
        <svg
            width={width}
            height={height}
            className="inline-block"
            role="img"
            aria-label="P95 latency sparkline"
        >
            <title>P95 latency trend</title>
            <polyline
                points={points}
                fill="none"
                className={colorMap[color] || colorMap.blue}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Compute health status from stats
// Different thresholds for text vs image models
function computeHealthStatus(stats, modelType = "text") {
    if (!stats || !stats.total_requests) return "on";

    const total = stats.total_requests;
    const pct5xx =
        (((stats.errors_500 || 0) +
            (stats.errors_502 || 0) +
            (stats.errors_503 || 0) +
            (stats.errors_504 || 0)) /
            total) *
        100;
    const pct504 = ((stats.errors_504 || 0) / total) * 100;
    const pct429 = ((stats.errors_429 || 0) / total) * 100;
    const p95 = stats.latency_p95_ms || 0;
    const count2xx = stats.status_2xx || 0;

    // Latency threshold for DEGRADED: image models are slower
    const p95TurbulentThreshold = modelType === "image" ? 60000 : 10000; // 1min vs 10s

    // OFF: pct_5xx >= 20%, pct_504 >= 5%, no 2xx, or very low success rate
    if (pct5xx >= 20) return "off";
    if (pct504 >= 5) return "off";
    if (count2xx === 0 && total > 0) return "off";
    const successRate = (count2xx / total) * 100;
    if (successRate < 25 && total > 0) return "off"; // Less than 25% success = OFF

    // TURBULENT: pct_5xx 5-20%, pct_429 >= 15%, P95 > threshold
    if (pct5xx >= 5) return "turbulent";
    if (pct429 >= 15) return "turbulent";
    if (p95 > p95TurbulentThreshold) return "turbulent";

    return "on";
}

// Status badge for model health (off/turbulent/on)
function StatusBadge({ stats, modelType }) {
    const status = computeHealthStatus(stats, modelType);
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
        { requests: 0, err401: 0, err403: 0, err429: 0, err4xxOther: 0 }
    );

    if (totals.requests === 0) return null;

    const total4xx =
        totals.err401 + totals.err403 + totals.err429 + totals.err4xxOther;
    if (total4xx === 0) return null;

    const pct = (n) => (totals.requests > 0 ? (n / totals.requests) * 100 : 0);
    const fmtPct = (n) => {
        const p = pct(n);
        if (p === 0) return "0%";
        return p < 1 ? p.toFixed(1) + "%" : Math.round(p) + "%";
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
    const {
        models,
        gatewayStats,
        isPolling,
        togglePolling,
        refresh,
        pollInterval,
        lastUpdated,
        error,
        tinybirdConfigured,
        endpointStatus,
    } = useModelMonitor();

    const [sort, setSort] = useState({ key: "requests", asc: false }); // Default: highest request count first
    const [countdown, setCountdown] = useState(pollInterval / 1000);

    // Countdown timer for auto-refresh
    useEffect(() => {
        if (!isPolling) return;

        // Reset countdown when data refreshes
        setCountdown(pollInterval / 1000);

        const timer = setInterval(() => {
            setCountdown((prev) => (prev > 0 ? prev - 1 : pollInterval / 1000));
        }, 1000);

        return () => clearInterval(timer);
    }, [isPolling, lastUpdated, pollInterval]);

    const handleSort = (key) => {
        setSort((prev) => ({
            key,
            asc: prev.key === key ? !prev.asc : true,
        }));
    };

    // Calculate total requests across all models
    const totalAllRequests = models.reduce(
        (sum, m) => sum + (m.stats?.total_requests || 0),
        0
    );

    // Helper to calculate status codes
    const get2xx = (s) => s?.status_2xx || 0;

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
                        ? new Date(a.stats.last_error_at + "Z").getTime()
                        : 0;
                const bTime =
                    b.stats?.last_error_at &&
                    b.stats.last_error_at !== "1970-01-01 00:00:00"
                        ? new Date(b.stats.last_error_at + "Z").getTime()
                        : 0;
                return dir * (aTime - bTime);
            }
            case "p50":
                return (
                    dir *
                    ((a.stats?.latency_p50_ms || 0) -
                        (b.stats?.latency_p50_ms || 0))
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
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                            Model Monitor
                        </h1>
                        <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            <span>5-minute window</span>
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
                                        (m) => m.type === "image"
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
                                        (m) => m.type === "text"
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
                        {!tinybirdConfigured && (
                            <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                Tinybird not configured
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={togglePolling}
                            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                                isPolling
                                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                            }`}
                        >
                            {isPolling ? (
                                <span>
                                    Auto{" "}
                                    <span className="tabular-nums font-mono">
                                        {countdown}s
                                    </span>
                                </span>
                            ) : (
                                "Paused"
                            )}
                        </button>

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

                {/* Gateway Health (pre-model errors) */}
                <GatewayHealth stats={gatewayStats} />

                {/* Model Table */}
                <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                            <tr>
                                <SortableTh
                                    label="Type"
                                    sortKey="type"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="center"
                                />
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
                                    label="Share"
                                    sortKey="share"
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
                                    label="Error"
                                    sortKey="errors"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="left"
                                />
                                <SortableTh
                                    label="Last Err"
                                    sortKey="lastError"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="P50"
                                    sortKey="p50"
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
                                <th className="px-3 py-2 font-medium text-center">
                                    <span className="text-[9px]">
                                        P95 | 5xx
                                    </span>
                                </th>
                                <th className="px-3 py-2 font-medium text-center">
                                    P95 Chart
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedModels.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={11}
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
                                    const share =
                                        totalAllRequests > 0
                                            ? (total / totalAllRequests) * 100
                                            : 0;
                                    const ok2xx = stats?.status_2xx || 0;
                                    const lastErrorAt = stats?.last_error_at;
                                    const lastErrorAgo =
                                        formatTimeAgo(lastErrorAt);
                                    const p50Ms = stats?.latency_p50_ms;
                                    const p95Ms = stats?.latency_p95_ms;
                                    const p50Sec = p50Ms ? p50Ms / 1000 : null;
                                    const p95Sec = p95Ms ? p95Ms / 1000 : null;
                                    // Tail ratio: P95/P50 indicates tail severity
                                    const tailRatio =
                                        p50Sec && p95Sec
                                            ? p95Sec / p50Sec
                                            : null;

                                    return (
                                        <tr
                                            key={`${model.type}-${model.name}`}
                                            className="hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2 text-center">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                        model.type === "image"
                                                            ? "bg-purple-100 text-purple-700"
                                                            : "bg-blue-100 text-blue-700"
                                                    }`}
                                                >
                                                    {model.type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-900">
                                                <div
                                                    className="flex items-center gap-1"
                                                    title={`Provider: ${
                                                        model.stats?.provider ||
                                                        "—"
                                                    }\nModel: ${
                                                        model.stats
                                                            ?.model_used || "—"
                                                    }`}
                                                >
                                                    {model.name}
                                                    <StatusBadge
                                                        stats={model.stats}
                                                        modelType={model.type}
                                                    />
                                                </div>
                                            </td>
                                            {/* Request count + RPM */}
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                                {total > 0 ? (
                                                    <div>
                                                        <span>
                                                            {total.toLocaleString()}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400 ml-1">
                                                            (
                                                            {Math.round(
                                                                total / 5
                                                            )}
                                                            /m)
                                                        </span>
                                                    </div>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            {/* Share */}
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                                {share > 0
                                                    ? (share < 1
                                                          ? share.toFixed(1)
                                                          : Math.round(share)) +
                                                      "%"
                                                    : "—"}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${get2xxColor(
                                                    ok2xx,
                                                    total
                                                )}`}
                                            >
                                                {formatPercent(
                                                    ok2xx,
                                                    total,
                                                    true
                                                )}
                                            </td>
                                            {/* Errors breakdown */}
                                            <td className="px-3 py-2">
                                                <ErrorBadges stats={stats} />
                                            </td>
                                            {/* Last Error */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${getLastErrorColor(
                                                    lastErrorAt
                                                )}`}
                                            >
                                                {lastErrorAgo || "—"}
                                            </td>
                                            {/* P50 */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    p50Sec
                                                        ? getLatencyColor(
                                                              p50Sec
                                                          )
                                                        : "text-gray-300"
                                                }`}
                                            >
                                                {p50Sec
                                                    ? `${p50Sec.toFixed(1)}s`
                                                    : "—"}
                                            </td>
                                            {/* P95 with tail indicator */}
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    !p95Sec
                                                        ? "text-gray-300"
                                                        : tailRatio > 3
                                                        ? "text-red-600 font-medium"
                                                        : tailRatio > 2
                                                        ? "text-yellow-600"
                                                        : getLatencyColor(
                                                              p95Sec
                                                          )
                                                }`}
                                            >
                                                {p95Sec
                                                    ? `${p95Sec.toFixed(1)}s`
                                                    : "—"}
                                            </td>
                                            {/* Trend */}
                                            <td className="px-3 py-2 text-center">
                                                <TrendIndicator
                                                    trend={model.trend}
                                                />
                                            </td>
                                            {/* P95 Sparkline */}
                                            <td className="px-3 py-2 text-center">
                                                <Sparkline
                                                    data={model.sparkline}
                                                    color="blue"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Health Status Legend */}
                <div className="text-[10px] text-gray-500 bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="font-medium text-gray-700">
                        Health Status Rules
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <span className="inline-block px-1 py-0.5 rounded text-[8px] font-bold bg-red-100 text-red-700 border border-red-300 mr-1">
                                OFF
                            </span>
                            <span>5xx ≥ 20% • 504 ≥ 5% • Success &lt; 25%</span>
                        </div>
                        <div>
                            <span className="inline-block px-1 py-0.5 rounded text-[8px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-300 mr-1">
                                DEGRADED
                            </span>
                            <span>
                                5xx ≥ 5% • 429 ≥ 15% • P95 &gt; 10s (text) /
                                1min (image)
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
