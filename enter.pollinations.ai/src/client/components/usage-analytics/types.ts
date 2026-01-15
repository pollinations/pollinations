export type DailyUsageRecord = {
    date: string;
    event_type: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    api_key_names: string[];
};

export type TimeRange = "7d" | "30d" | "all" | "custom";
export type Metric = "requests" | "pollen" | "tokens";

export type FilterState = {
    timeRange: TimeRange;
    customDays: number;
    metric: Metric;
    selectedKeys: string[];
    selectedModels: string[];
};

export type ModelBreakdown = {
    model: string;
    label: string;
    requests: number;
    pollen: number;
    tokens: number;
};

export type DataPoint = {
    label: string;
    value: number;
    timestamp: Date;
    fullDate: string;
    modelBreakdown?: ModelBreakdown[];
};

export type SelectOption = { value: string | null; label: string };
