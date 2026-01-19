export type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    api_key_names: string[];
};

export type TimeRange = "7d" | "30d" | "all";
export type Metric = "requests" | "pollen";

export type FilterState = {
    timeRange: TimeRange;
    metric: Metric;
    selectedKeys: string[];
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
