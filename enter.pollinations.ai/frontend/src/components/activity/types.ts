import type { ActivityPeriod } from "./activity-period";

export type DailyUsageRecord = {
    date: string;
    api_key_id: string;
    api_key: string | null;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

export type Metric = "requests" | "pollen";

export type FilterState = {
    period: ActivityPeriod;
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
};
