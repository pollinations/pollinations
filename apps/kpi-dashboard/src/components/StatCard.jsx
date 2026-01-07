import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { useState } from "react";

function TooltipIcon({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-gray-500 hover:text-gray-300 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <span className="absolute left-full ml-2 z-[9999] w-48 p-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-xs text-gray-300 whitespace-normal font-normal">
          {text}
        </span>
      )}
    </span>
  );
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  format = "number",
  tooltip,
}) {
  const formatValue = (val) => {
    if (val == null || Number.isNaN(val)) return "—";
    if (format === "currency") return `$${Math.round(val).toLocaleString()}`;
    if (format === "percent") return `${Math.round(val)}%`;
    if (format === "compact") {
      if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)}B`;
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return Math.round(val).toLocaleString();
    }
    return Math.round(val).toLocaleString();
  };

  const getTrendIcon = () => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (change > 0) return "text-green-400";
    if (change < 0) return "text-red-400";
    return "text-gray-400";
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium flex items-center gap-1">
          {title}
          {tooltip && <TooltipIcon text={tooltip} />}
        </span>
        {Icon && <Icon className="w-5 h-5 text-gray-500" />}
      </div>
      <div>
        <span className="text-3xl font-bold text-white block">
          {formatValue(value)}
        </span>
        {change != null && !Number.isNaN(change) && (
          <div
            className={`flex items-center gap-1 text-sm mt-1 ${getTrendColor()}`}
          >
            {getTrendIcon()}
            <span>
              {change > 0 ? "+" : ""}
              {Math.round(change)}%
            </span>
          </div>
        )}
      </div>
      {changeLabel && (
        <span className="text-xs text-gray-500 mt-1 block">{changeLabel}</span>
      )}
    </div>
  );
}
