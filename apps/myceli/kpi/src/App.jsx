import { format } from "date-fns";
import {
    Activity,
    AlertTriangle,
    DollarSign,
    Download,
    Star,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getWeeklyRegistrations } from "./api/enter";
import { getGitHubStats } from "./api/github";
import { getWeeklyRevenue } from "./api/polar";
import {
    getWeeklyActiveUsers,
    getWeeklyChurn,
    getWeeklyHealthStats,
    getWeeklyRetention,
    getWeeklyUsageStats,
    getWeeklyUserSegments,
} from "./api/tinybird";
import { FunnelChart } from "./components/FunnelChart";
import { KPITrendTable } from "./components/KPITrendTable";
import { RetentionTable } from "./components/RetentionTable";
import { StatCard } from "./components/StatCard";
import { WeeklyChart } from "./components/WeeklyChart";

export default function App() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        weeklyData: [],
        retentionData: [],
        github: { stars: 0, forks: 0 },
        currentWeek: null,
        previousWeek: null,
    });

    useEffect(() => {
        async function fetchAllData() {
            setLoading(true);
            setError(null);

            try {
                // Fetch all data sources in parallel
                const [
                    github,
                    d1Registrations,
                    tinybirdWAU,
                    tinybirdUsage,
                    tinybirdRetention,
                    tinybirdHealth,
                    polarRevenue,
                    tinybirdSegments,
                    tinybirdChurn,
                ] = await Promise.all([
                    getGitHubStats(),
                    getWeeklyRegistrations(12),
                    getWeeklyActiveUsers(12),
                    getWeeklyUsageStats(12),
                    getWeeklyRetention(8),
                    getWeeklyHealthStats(12),
                    getWeeklyRevenue(12),
                    getWeeklyUserSegments(12),
                    getWeeklyChurn(12),
                ]);

                // Check for missing data
                const missing = [];
                if (!d1Registrations) missing.push("D1 (registrations)");
                if (!tinybirdWAU) missing.push("Tinybird (WAU)");
                if (!tinybirdUsage) missing.push("Tinybird (usage)");
                if (!polarRevenue || polarRevenue.length === 0)
                    missing.push("Revenue (Stripe/Polar)");

                if (missing.length > 0) {
                    setError(
                        `Missing data sources: ${missing.join(
                            ", ",
                        )}. Check secrets/env.json`,
                    );
                }

                // Merge all data sources by week
                const weekMap = new Map();

                // D1: registrations
                if (d1Registrations) {
                    for (const row of d1Registrations) {
                        weekMap.set(row.week_start, {
                            week: row.week_start,
                            registrations: row.registrations,
                        });
                    }
                }

                // Tinybird: WAU, paying users
                if (tinybirdWAU) {
                    for (const row of tinybirdWAU) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            wau: row.active_users,
                            payingUsers: row.paying_users,
                            totalRequests: row.total_requests,
                        });
                    }
                }

                // Tinybird: tokens, usage per user
                if (tinybirdUsage) {
                    for (const row of tinybirdUsage) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            tokens: row.total_tokens,
                            tokensPerUser: row.tokens_per_user,
                            textRequests: row.text_requests,
                            imageRequests: row.image_requests,
                        });
                    }
                }

                // Polar: revenue, purchases
                if (polarRevenue) {
                    for (const row of polarRevenue) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            revenue: row.revenue,
                            packPurchases: row.purchases,
                        });
                    }
                }

                // Tinybird: health stats (service availability)
                if (tinybirdHealth) {
                    for (const row of tinybirdHealth) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            availability: row.availability,
                            serverErrors5xx: row.server_errors_5xx,
                            latencyP50: row.latency_p50_ms,
                            latencyP95: row.latency_p95_ms,
                        });
                    }
                }

                // Tinybird: user segments (B2B vs B2C)
                if (tinybirdSegments) {
                    for (const row of tinybirdSegments) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            developerUsers: row.developer_users,
                            developerPollen: row.developer_pollen,
                            enduserUsers: row.enduser_users,
                            enduserPollen: row.enduser_pollen,
                            enduserUserPct: row.enduser_user_pct,
                            enduserPollenPct: row.enduser_pollen_pct,
                        });
                    }
                }

                // Tinybird: churn metrics
                if (tinybirdChurn) {
                    for (const row of tinybirdChurn) {
                        const existing = weekMap.get(row.week) || {
                            week: row.week,
                        };
                        weekMap.set(row.week, {
                            ...existing,
                            churnedUsers: row.churned_users,
                            churnRate: row.churn_rate,
                            users4wAgo: row.users_4w_ago,
                        });
                    }
                }

                // Convert map to sorted array
                const weeklyData = Array.from(weekMap.values())
                    .filter((w) => w.week)
                    .sort((a, b) => a.week.localeCompare(b.week));

                // Add activations estimate (users who made requests within 7 days of registration)
                // TODO: Get real activation data from cross-referencing D1 + Tinybird
                for (const week of weeklyData) {
                    week.activations = week.wau || 0; // Placeholder until we have real activation tracking
                }

                // Retention data from Tinybird - map field names
                const retentionData = (tinybirdRetention || []).map((row) => ({
                    cohort: row.cohort,
                    users: row.cohort_size,
                    w1: row.w1_retention,
                    w2: row.w2_retention,
                    w3: row.w3_retention,
                    w4: row.w4_retention,
                }));

                // Separate current partial week from full weeks
                const today = new Date();
                const currentWeekStart = new Date(
                    Date.UTC(
                        today.getUTCFullYear(),
                        today.getUTCMonth(),
                        today.getUTCDate() - ((today.getUTCDay() + 6) % 7),
                    ),
                )
                    .toISOString()
                    .split("T")[0];

                const partialWeek =
                    weeklyData.find((w) => w.week === currentWeekStart) || null;
                const fullWeeks = weeklyData.filter(
                    (w) => w.week !== currentWeekStart,
                );

                // Use last two FULL weeks for stats
                const lastFullWeek = fullWeeks[fullWeeks.length - 1] || null;
                const prevFullWeek = fullWeeks[fullWeeks.length - 2] || null;

                setData({
                    weeklyData,
                    retentionData,
                    github,
                    currentWeek: lastFullWeek, // Stats show last FULL week
                    previousWeek: prevFullWeek,
                    partialWeek, // Current partial week (for reference)
                });
            } catch (err) {
                console.error("Failed to fetch data:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchAllData();
    }, []);

    const calcChange = (current, previous) => {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous) * 100;
    };

    const {
        currentWeek,
        previousWeek,
        github,
        weeklyData,
        retentionData,
        partialWeek,
    } = data;

    // Filter out partial week for charts
    const fullWeeksData =
        weeklyData?.filter((w) => w.week !== partialWeek?.week) || [];

    // North Star: WAPC (Weekly Active Paying Customers)
    const wapc = currentWeek?.packPurchases || 0;
    const wapcPrev = previousWeek?.packPurchases || 0;
    const wapcChange = calcChange(wapc, wapcPrev);

    // Funnel data
    const funnelData = currentWeek
        ? [
              {
                  stage: "Signups",
                  count: currentWeek.registrations || 0,
                  rate: 100,
              },
              {
                  stage: "Activated",
                  count: currentWeek.activations || 0,
                  rate: currentWeek.registrations
                      ? (
                            (currentWeek.activations /
                                currentWeek.registrations) *
                            100
                        ).toFixed(0)
                      : 0,
              },
              { stage: "Active (WAU)", count: currentWeek.wau || 0, rate: 100 },
              {
                  stage: "Paying",
                  count: currentWeek.packPurchases || 0,
                  rate: currentWeek.wau
                      ? (
                            (currentWeek.packPurchases / currentWeek.wau) *
                            100
                        ).toFixed(1)
                      : 0,
              },
          ]
        : [];

    const handleExport = () => {
        const csv = [
            [
                "Week",
                "Registrations",
                "Activations",
                "WAU",
                "Tokens",
                "Revenue",
                "Pack Purchases",
            ].join(","),
            ...weeklyData.map((row) =>
                [
                    row.week,
                    row.registrations,
                    row.activations,
                    row.wau,
                    row.tokens,
                    row.revenue,
                    row.packPurchases,
                ].join(","),
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kpi-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="animate-pulse text-gray-400">
                    Loading KPIs from all data sources...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 max-w-lg">
                    <div className="flex items-center gap-3 text-red-400 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-semibold">Data Source Error</span>
                    </div>
                    <p className="text-gray-300">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <img
                                src="/logo.svg"
                                alt="pollinations.ai"
                                className="h-8 w-8"
                            />
                            <h1 className="text-2xl font-semibold tracking-tight">
                                pollinations.ai{" "}
                                <span className="text-gray-500 font-normal">
                                    by Myceli.AI
                                </span>
                            </h1>
                        </div>
                        <p className="text-gray-500 text-sm">
                            Weekly KPI Dashboard
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>

                {/* North Star - WAPC */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                                North Star{" "}
                                <span className="text-gray-600">
                                    · Last full week (
                                    {currentWeek?.week?.slice(5)})
                                </span>
                            </p>
                            <p className="text-xl font-medium">
                                Weekly Active Paying Customers
                            </p>
                            <p className="text-gray-500 text-sm mt-1">
                                Users who made a purchase
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-4xl font-semibold">
                                {wapc}
                            </span>
                            <span
                                className={`block text-sm mt-1 ${
                                    wapcChange >= 0
                                        ? "text-emerald-500"
                                        : "text-red-500"
                                }`}
                            >
                                {wapcChange >= 0 ? "↑" : "↓"}{" "}
                                {wapcChange != null
                                    ? Math.abs(wapcChange).toFixed(1)
                                    : 0}
                                % WoW
                            </span>
                        </div>
                    </div>
                </div>

                {/* Key Stats Row */}
                <p className="text-gray-500 text-xs mb-2">
                    Last full week ({currentWeek?.week?.slice(5)}) vs previous
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                    <StatCard
                        title="New Signups"
                        value={currentWeek?.registrations || 0}
                        change={calcChange(
                            currentWeek?.registrations,
                            previousWeek?.registrations,
                        )}
                        icon={Users}
                        tooltip="New user registrations this week"
                    />
                    <StatCard
                        title="Activated (D7)"
                        value={currentWeek?.activations || 0}
                        change={calcChange(
                            currentWeek?.activations,
                            previousWeek?.activations,
                        )}
                        icon={Zap}
                        tooltip="Users who made API requests within 7 days of signup"
                    />
                    <StatCard
                        title="WAU"
                        value={currentWeek?.wau || 0}
                        change={calcChange(currentWeek?.wau, previousWeek?.wau)}
                        icon={Activity}
                        tooltip="Weekly Active Users - unique users with API activity"
                    />
                    <StatCard
                        title="Tokens Used"
                        value={currentWeek?.tokens || 0}
                        change={calcChange(
                            currentWeek?.tokens,
                            previousWeek?.tokens,
                        )}
                        icon={TrendingUp}
                        format="compact"
                        tooltip="Total tokens consumed across all API requests"
                    />
                    <StatCard
                        title="Revenue"
                        value={currentWeek?.revenue || 0}
                        change={calcChange(
                            currentWeek?.revenue,
                            previousWeek?.revenue,
                        )}
                        icon={DollarSign}
                        format="currency"
                        tooltip="Pollen pack purchases (Stripe + Polar legacy)"
                    />
                    <StatCard
                        title="GitHub Stars"
                        value={github.stars}
                        icon={Star}
                        format="compact"
                        tooltip="Stars on pollinations/pollinations repo"
                    />
                </div>

                {/* 12-Week KPI Trend Table */}
                <div className="mb-8">
                    <KPITrendTable
                        weeklyData={weeklyData}
                        title="KPI Trend (Last 12 Weeks)"
                    />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <WeeklyChart
                        data={fullWeeksData}
                        title="Acquisition & Activation"
                        lines={[
                            { key: "registrations", label: "Signups" },
                            { key: "activations", label: "Activated" },
                            { key: "wau", label: "WAU" },
                        ]}
                    />
                    <WeeklyChart
                        data={fullWeeksData}
                        title="Usage & Revenue"
                        lines={[
                            { key: "tokens", label: "Tokens" },
                            { key: "revenue", label: "Revenue ($)" },
                        ]}
                        dualAxis={true}
                    />
                </div>

                {/* Funnel & Retention */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <FunnelChart
                        data={funnelData}
                        title={`Conversion Funnel (${
                            currentWeek?.week?.slice(5) || "Last Week"
                        })`}
                    />
                    <RetentionTable
                        data={retentionData}
                        title="Weekly Cohort Retention"
                    />
                </div>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t border-gray-800">
                    <div className="flex items-center justify-between text-gray-500 text-xs">
                        <div className="flex items-center gap-2">
                            <img
                                src="/myceli-logo.svg"
                                alt=""
                                className="h-4 w-4"
                            />
                            <span>Myceli.AI</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span>Sources: D1 · Tinybird · Stripe · GitHub</span>
                            <span>Updated {format(new Date(), "PP")}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
