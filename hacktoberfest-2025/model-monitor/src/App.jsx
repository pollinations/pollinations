import { useState } from "react";
import { useModelMonitor } from "./hooks/useModelMonitor";

// Helper to format percentage
function formatPercent(count, total) {
    if (!total || total === 0) return "—";
    const pct = (count / total) * 100;
    if (pct === 0) return "—";
    return pct < 1 ? pct.toFixed(1) + "%" : Math.round(pct) + "%";
}

// Helper to get color class based on error percentage
function getErrorColor(count, total) {
    if (!total || count === 0) return "text-gray-300";
    const pct = (count / total) * 100;
    if (pct > 10) return "text-red-600 font-medium";
    if (pct > 5) return "text-red-500";
    if (pct > 1) return "text-yellow-600";
    return "text-yellow-500";
}

// Helper to get 2xx color
function get2xxColor(ok2xx, total) {
    if (!total || ok2xx === 0) return "text-gray-300";
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

function getLatencyBarColor(latencySec) {
    if (latencySec < 2) return "bg-blue-500";
    if (latencySec < 5) return "bg-green-500";
    if (latencySec < 10) return "bg-yellow-500";
    return "bg-red-500";
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
    } = useModelMonitor();

    const [sort, setSort] = useState({ key: "share", asc: false }); // Default: highest share first

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
    const get4xx = (s) =>
        (s?.errors_401 || 0) +
        (s?.errors_403 || 0) +
        (s?.errors_429 || 0) +
        (s?.errors_4xx_other || 0);
    const get5xx = (s) =>
        (s?.errors_500 || 0) +
        (s?.errors_502 || 0) +
        (s?.errors_503 || 0) +
        (s?.errors_504 || 0) +
        (s?.errors_5xx_other || 0);

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
            case "err4xx":
                return dir * (get4xx(a.stats) - get4xx(b.stats));
            case "err5xx":
                return dir * (get5xx(a.stats) - get5xx(b.stats));
            case "latency":
                return (
                    dir *
                    ((a.stats?.avg_latency_ms || 0) -
                        (b.stats?.avg_latency_ms || 0))
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
                        <p className="text-xs text-gray-500">
                            enter.pollinations.ai • 5 min window
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
                            {isPolling
                                ? `Auto (${pollInterval / 1000}s)`
                                : "Paused"}
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
                                    label="Share"
                                    sortKey="share"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="2xx"
                                    sortKey="ok2xx"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="4xx"
                                    sortKey="err4xx"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="5xx"
                                    sortKey="err5xx"
                                    currentSort={sort}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableTh
                                    label="Latency"
                                    sortKey="latency"
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
                                        colSpan={7}
                                        className="p-8 text-center text-gray-400"
                                    >
                                        Loading models...
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
                                    const err4xx =
                                        (stats?.errors_401 || 0) +
                                        (stats?.errors_403 || 0) +
                                        (stats?.errors_429 || 0) +
                                        (stats?.errors_4xx_other || 0);
                                    const err5xx =
                                        (stats?.errors_500 || 0) +
                                        (stats?.errors_502 || 0) +
                                        (stats?.errors_503 || 0) +
                                        (stats?.errors_504 || 0) +
                                        (stats?.errors_5xx_other || 0);
                                    const latencyMs = stats?.avg_latency_ms;
                                    const latencySec = latencyMs
                                        ? latencyMs / 1000
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
                                            <td className="px-3 py-2 font-mono text-gray-900">
                                                {model.name}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums text-blue-600 font-medium`}
                                            >
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
                                                {formatPercent(ok2xx, total)}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${getErrorColor(
                                                    err4xx,
                                                    total
                                                )}`}
                                            >
                                                {formatPercent(err4xx, total)}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${getErrorColor(
                                                    err5xx,
                                                    total
                                                )}`}
                                            >
                                                {formatPercent(err5xx, total)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {latencySec ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${getLatencyBarColor(
                                                                    latencySec
                                                                )}`}
                                                                style={{
                                                                    width: `${Math.min(
                                                                        100,
                                                                        (latencySec /
                                                                            60) *
                                                                            100
                                                                    )}%`,
                                                                }}
                                                            />
                                                        </div>
                                                        <span
                                                            className={`tabular-nums text-xs ${getLatencyColor(
                                                                latencySec
                                                            )}`}
                                                        >
                                                            {latencySec.toFixed(
                                                                1
                                                            )}
                                                            s
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <footer className="text-center text-[10px] text-gray-400">
                    {sortedModels.length} models • Updated:{" "}
                    {lastUpdated?.toLocaleTimeString() || "—"}
                </footer>
            </div>
        </div>
    );
}

export default App;
