import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function WeeklyChart({
  data,
  lines,
  title,
  yAxisFormat = "number",
  dualAxis = false,
}) {
  const formatCompact = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value;
  };

  const formatCurrency = (value) => `$${value.toLocaleString()}`;

  const formatYAxis = (value) => {
    if (yAxisFormat === "compact") return formatCompact(value);
    if (yAxisFormat === "currency") return formatCurrency(value);
    return value;
  };

  const colors = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="week"
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(val) => val.slice(5)} // Show MM-DD
            />
            {dualAxis ? (
              <>
                <YAxis
                  yAxisId="left"
                  stroke="#22c55e"
                  fontSize={12}
                  tickFormatter={formatCompact}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#3b82f6"
                  fontSize={12}
                  tickFormatter={formatCurrency}
                />
              </>
            ) : (
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={formatYAxis}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#fff",
              }}
              labelStyle={{ color: "#9ca3af" }}
              itemStyle={{ color: "#fff" }}
            />
            <Legend />
            {lines.map((line, idx) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                yAxisId={dualAxis ? (idx === 0 ? "left" : "right") : undefined}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
