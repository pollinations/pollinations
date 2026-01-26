import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

function Tooltip({ text, children }) {
    const [show, setShow] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef(null);

    const handleMouseEnter = () => {
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPos({
                top: rect.top - 10,
                left: rect.right + 8,
            });
        }
        setShow(true);
    };

    return (
        <span className="inline-flex items-center gap-1">
            {children}
            <button
                ref={btnRef}
                type="button"
                className="text-gray-500 hover:text-gray-300 cursor-help"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setShow(false)}
            >
                <Info className="w-3 h-3" />
            </button>
            {show &&
                createPortal(
                    <span
                        className="fixed z-[9999] w-72 p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-xs text-gray-300 whitespace-normal font-normal"
                        style={{ top: pos.top, left: pos.left }}
                    >
                        <span className="font-semibold text-white block mb-1">
                            How it's calculated:
                        </span>
                        {text}
                    </span>,
                    document.body,
                )}
        </span>
    );
}

export function KPITrendTable({ weeklyData, title }) {
    const formatValue = (value, format) => {
        if (value === null || value === undefined || Number.isNaN(value))
            return "—";
        if (format === "currency")
            return `$${Math.round(value).toLocaleString()}`;
        if (format === "percent") return `${Math.round(value)}%`;
        if (format === "compact") {
            if (value >= 1000000000)
                return `${Math.round(value / 1000000000)}B`;
            if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
            if (value >= 1000) return `${Math.round(value / 1000)}K`;
        }
        return Math.round(value).toLocaleString();
    };

    const calcChange = (current, previous) => {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous) * 100;
    };

    const getTrendIcon = (change) => {
        if (change > 5)
            return <TrendingUp className="w-3 h-3 text-green-400" />;
        if (change < -5)
            return <TrendingDown className="w-3 h-3 text-red-400" />;
        return <Minus className="w-3 h-3 text-gray-500" />;
    };

    // Define KPIs to track with tooltips explaining calculations
    const kpis = [
        {
            key: "registrations",
            name: "New Registrations",
            category: "Acquisition",
            format: "number",
            tooltip:
                "Count of new user accounts created during the week. Source: D1 database (user.created_at)",
        },
        {
            key: "activations",
            name: "Activated (D7)",
            category: "Acquisition",
            format: "number",
            tooltip:
                "Users who made at least one API request within 7 days of registration. Source: D1 + Tinybird (generation_event)",
        },
        {
            key: "activationRate",
            name: "D7 Activation Rate",
            category: "Acquisition",
            format: "percent",
            calc: (w) => (w.activations / w.registrations) * 100,
            tooltip:
                "Formula: (Activated Users / New Registrations) × 100. Measures what % of signups become real users within 7 days.",
        },
        {
            key: "wau",
            name: "WAU",
            category: "Usage",
            format: "number",
            tooltip:
                "Weekly Active Users: Unique users with at least one API request this week. Source: Tinybird (uniqExact(user_id) from generation_event)",
        },
        {
            key: "tokens",
            name: "Total Tokens",
            category: "Usage",
            format: "compact",
            tooltip:
                "Sum of all tokens consumed (prompt + completion). Source: Tinybird (sum(token_count_prompt_text + token_count_completion_text))",
        },
        {
            key: "tokensPerUser",
            name: "Tokens/User",
            category: "Usage",
            format: "compact",
            calc: (w) => w.tokens / w.wau,
            tooltip:
                "Formula: Total Tokens / WAU. Measures usage depth — how much each active user consumes on average.",
        },
        {
            key: "revenue",
            name: "Revenue",
            category: "Revenue",
            format: "currency",
            tooltip:
                "Gross revenue in USD from pollen pack purchases. Source: Polar API (order amounts)",
        },
        {
            key: "packPurchases",
            name: "Pack Purchases",
            category: "Revenue",
            format: "number",
            tooltip:
                "Count of completed pollen pack purchases this week. Source: Polar API (successful orders)",
        },
        {
            key: "arpa",
            name: "ARPA",
            category: "Revenue",
            format: "currency",
            calc: (w) => w.revenue / w.wau,
            tooltip:
                "Average Revenue Per Active user. Formula: Weekly Revenue / WAU. Measures monetization efficiency.",
        },
        {
            key: "revenuePerMTokens",
            name: "Rev/1M Tokens",
            category: "Efficiency",
            format: "currency",
            calc: (w) => (w.revenue / w.tokens) * 1000000,
            tooltip:
                "Formula: (Revenue / Total Tokens) × 1,000,000. Unit economics — how much revenue per million tokens consumed.",
        },
        {
            key: "conversionRate",
            name: "Activation→Purchase",
            category: "Efficiency",
            format: "percent",
            calc: (w) => (w.packPurchases / w.activations) * 100,
            tooltip:
                "Formula: (Pack Purchases / Activated Users) × 100. Funnel conversion from activation to paying customer.",
        },
        {
            key: "availability",
            name: "Service Availability",
            category: "Health",
            format: "percent",
            tooltip:
                "% of requests without server errors (5xx). User errors (4xx) don't count as downtime. Formula: (total - 5xx) / total × 100",
        },
    ];

    // Get value for a KPI from weekly data
    const getValue = (kpi, week) => {
        if (kpi.calc) return kpi.calc(week);
        return week[kpi.key];
    };

    // Separate current (partial) week from full weeks
    // Current week is partial if it's the same week as today
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

    const currentWeek =
        weeklyData.find((w) => w.week === currentWeekStart) ||
        weeklyData[weeklyData.length - 1];
    const fullWeeks = weeklyData.filter((w) => w.week !== currentWeekStart);

    // WoW: compare last two FULL weeks
    const lastFullWeek = fullWeeks[fullWeeks.length - 1];
    const prevFullWeek = fullWeeks[fullWeeks.length - 2];

    // Reverse full weeks for display (most recent on left)
    const displayWeeks = [...fullWeeks].reverse();

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left py-2 px-2 sticky left-0 bg-gray-900/95 min-w-32">
                                KPI
                            </th>
                            <th className="text-right py-2 px-2 min-w-16 bg-blue-900/20 border-x border-blue-800/30">
                                <span className="text-blue-400">Now</span>
                                <span className="block text-[10px] text-blue-400/70">
                                    {currentWeek?.week?.slice(5)}
                                </span>
                            </th>
                            <th className="text-right py-2 px-2 min-w-16">
                                WoW
                            </th>
                            {displayWeeks.map((week) => (
                                <th
                                    key={week.week}
                                    className="text-right py-2 px-2 min-w-16 font-normal"
                                >
                                    {week.week.slice(5)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {kpis.map((kpi) => {
                            // Current partial week value
                            const nowVal = currentWeek
                                ? getValue(kpi, currentWeek)
                                : null;
                            // WoW: compare last two FULL weeks
                            const lastVal = lastFullWeek
                                ? getValue(kpi, lastFullWeek)
                                : 0;
                            const prevVal = prevFullWeek
                                ? getValue(kpi, prevFullWeek)
                                : 0;
                            const change = calcChange(lastVal, prevVal);

                            return (
                                <tr
                                    key={kpi.key}
                                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                                >
                                    <td className="py-2 px-2 sticky left-0 bg-gray-900/95">
                                        <Tooltip text={kpi.tooltip}>
                                            <span className="font-medium text-white">
                                                {kpi.name}
                                            </span>
                                        </Tooltip>
                                        <span className="text-gray-500 text-[10px] block">
                                            {kpi.category}
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 text-right text-blue-300 font-mono bg-blue-900/20 border-x border-blue-800/30">
                                        {formatValue(nowVal, kpi.format)}
                                    </td>
                                    <td
                                        className={`py-2 px-2 text-right font-mono ${
                                            change > 0
                                                ? "text-green-400"
                                                : change < 0
                                                  ? "text-red-400"
                                                  : "text-gray-400"
                                        }`}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            {getTrendIcon(change)}
                                            <span>
                                                {change > 0 ? "+" : ""}
                                                {change != null &&
                                                !Number.isNaN(change)
                                                    ? change.toFixed(0)
                                                    : 0}
                                                %
                                            </span>
                                        </div>
                                    </td>
                                    {displayWeeks.map((week) => (
                                        <td
                                            key={week.week}
                                            className="py-2 px-2 text-right text-gray-300 font-mono"
                                        >
                                            {formatValue(
                                                getValue(kpi, week),
                                                kpi.format,
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 text-xs text-gray-500">
                <span className="text-blue-400">Now</span> = current partial
                week • <span className="text-green-400">WoW</span> = comparing
                last 2 full weeks • {displayWeeks.length} full weeks shown
            </div>
        </div>
    );
}
