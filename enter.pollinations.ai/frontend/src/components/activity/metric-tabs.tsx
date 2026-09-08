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
    <div className="flex min-w-0 flex-col gap-1.5">
        <span className="px-1 text-xs font-medium text-theme-text-muted">
            Show
        </span>
        <div className="flex min-w-0 gap-1 @[36rem]:flex-col">
            {METRIC_OPTIONS.map((metric) => (
                <TabButton
                    key={metric}
                    active={value === metric}
                    onClick={() => onChange(metric)}
                    size="sm"
                    className="min-h-8 flex-1 text-xs!"
                >
                    {METRIC_LABELS[metric]}
                </TabButton>
            ))}
        </div>
    </div>
);
