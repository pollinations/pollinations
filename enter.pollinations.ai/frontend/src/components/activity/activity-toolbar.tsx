import { Button } from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import type { ActivityPeriod } from "./activity-period";
import { ActivityPeriodNavigation } from "./activity-period-navigation";
import { MetricTabs } from "./metric-tabs";
import type { Metric } from "./types";

export const ActivityToolbar: FC<{
    label: string;
    period: ActivityPeriod;
    onPeriodChange: (period: ActivityPeriod) => void;
    metric: Metric;
    onMetricChange: (metric: Metric) => void;
    download: ReactNode;
    children: ReactNode;
}> = ({
    label,
    period,
    onPeriodChange,
    metric,
    onMetricChange,
    download,
    children,
}) => (
    <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ActivityPeriodNavigation
                    label={label}
                    value={period}
                    onChange={onPeriodChange}
                />
                {period.bucket && (
                    <div data-theme="neutral">
                        <Button
                            size="sm"
                            aria-label={`Show full ${label.toLowerCase()} period`}
                            onClick={() =>
                                onPeriodChange({ ...period, bucket: undefined })
                            }
                        >
                            Show full period
                        </Button>
                    </div>
                )}
            </div>
            <div data-theme="neutral" className="shrink-0">
                {download}
            </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-3 @[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]">
            {children}
            <div className="min-w-0">
                <MetricTabs value={metric} onChange={onMetricChange} />
            </div>
        </div>
    </header>
);
