import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export function FunnelChart({ data, title }) {
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <XAxis type="number" stroke="#6b7280" fontSize={12} />
            <YAxis
              type="category"
              dataKey="stage"
              stroke="#6b7280"
              fontSize={12}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#fff",
              }}
              labelStyle={{ color: "#9ca3af" }}
              itemStyle={{ color: "#fff" }}
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              formatter={(value, name, props) => [
                `${value.toLocaleString()} (${props.payload.rate}%)`,
                "Count",
              ]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors[index % colors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-4 text-sm">
        {data.slice(0, -1).map((item, idx) => (
          <div key={idx} className="text-center">
            <span className="text-gray-400">
              {item.stage} → {data[idx + 1]?.stage}
            </span>
            <span className="block text-white font-medium">
              {data[idx + 1] && item.count
                ? ((data[idx + 1].count / item.count) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
