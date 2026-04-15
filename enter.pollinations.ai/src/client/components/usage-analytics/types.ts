export type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

export type TimeRange = "7d" | "30d" | "all";
export const TIME_RANGE_DAYS: Record<TimeRange, number> = {
    "7d": 7,
    "30d": 30,
    all: 90,
};
export type Metric = "requests" | "pollen";

export type FilterState = {
    timeRange: TimeRange;
    metric: Metric;
    selectedKey: string | null;
    selectedModels: string[];
};

export type ModelBreakdown = {
    model: string;
    label: string;
    requests: number;
    pollen: number;
};

export type DataPoint = {
    label: string;
    value: number;
    tierValue: number;
    paidValue: number;
    timestamp: Date;
    fullDate: string;
    modelBreakdown?: ModelBreakdown[];
};
