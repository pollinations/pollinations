import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export function KPIOverview({ data, title }) {
    const getTrendIcon = (change) => {
        if (change > 0)
            return <TrendingUp className="w-4 h-4 text-green-400" />;
        if (change < 0)
            return <TrendingDown className="w-4 h-4 text-red-400" />;
        return <Minus className="w-4 h-4 text-gray-400" />;
    };

    const getTrendColor = (change) => {
        if (change > 0) return "text-green-400";
        if (change < 0) return "text-red-400";
        return "text-gray-400";
    };

    const formatValue = (value, format) => {
        if (value == null || Number.isNaN(value)) return "—";
        if (format === "currency") return `$${value.toLocaleString()}`;
        if (format === "percent") return `${value.toFixed(1)}%`;
        if (format === "compact") {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toLocaleString();
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left py-2 px-3">KPI</th>
                            <th className="text-right py-2 px-3">This Week</th>
                            <th className="text-right py-2 px-3">Last Week</th>
                            <th className="text-right py-2 px-3">WoW Change</th>
                            <th className="text-right py-2 px-3">Trend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr
                                key={row.name}
                                className="border-b border-gray-800 hover:bg-gray-800/30"
                            >
                                <td className="py-3 px-3">
                                    <span className="font-medium text-white">
                                        {row.name}
                                    </span>
                                    {row.category && (
                                        <span className="text-xs text-gray-500 block">
                                            {row.category}
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-3 text-right text-white font-mono">
                                    {formatValue(row.current, row.format)}
                                </td>
                                <td className="py-3 px-3 text-right text-gray-400 font-mono">
                                    {formatValue(row.previous, row.format)}
                                </td>
                                <td
                                    className={`py-3 px-3 text-right font-mono ${getTrendColor(
                                        row.change,
                                    )}`}
                                >
                                    {row.change != null &&
                                    !Number.isNaN(row.change) ? (
                                        <>
                                            {row.change > 0 ? "+" : ""}
                                            {row.change.toFixed(1)}%
                                        </>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                                <td className="py-3 px-3 text-right">
                                    {getTrendIcon(row.change)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
