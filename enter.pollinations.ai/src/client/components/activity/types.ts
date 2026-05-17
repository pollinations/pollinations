export type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

export type PeriodGranularity = "day" | "week" | "month";

export type UsagePeriodSelection = {
    granularity: PeriodGranularity;
    period: string;
};

export type Metric = "requests" | "pollen";

export type FilterState = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedKeyIds: string[];
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
