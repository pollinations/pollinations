import { TabButton } from "@pollinations/ui";
import type { FC } from "react";
import type { Metric } from "./types";

const METRIC_LABELS: Record<Metric, string> = {
    requests: "Requests",
    pollen: "Pollen",
};

const METRIC_OPTIONS: Metric[] = ["pollen", "requests"];

export const MetricTabs: FC<{
    value: Metric;
    onChange: (metric: Metric) => void;
}> = ({ value, onChange }) => (
    <div className="flex w-full items-center gap-3">
        <span className="w-20 shrink-0 text-xs font-medium text-theme-text-soft">
            Metric
        </span>
        <div className="flex min-w-0 flex-1 max-w-60 flex-wrap justify-end gap-1.5">
            {METRIC_OPTIONS.map((metric) => (
                <TabButton
                    key={metric}
                    active={value === metric}
                    onClick={() => onChange(metric)}
                    size="sm"
                    className="flex-1"
                >
                    {METRIC_LABELS[metric]}
                </TabButton>
            ))}
        </div>
    </div>
);
