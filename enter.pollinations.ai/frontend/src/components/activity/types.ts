export type DailyUsageRecord = {
    date: string;
    api_key_id: string;
    api_key: string | null;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

export type DeveloperEarningsRow = {
    date: string;
    entity_id: string;
    entity_name: string;
    source: "byop_markup" | "community_model";
    requests: number;
    paid_requests: number;
    tier_requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
};

export type Metric = "requests" | "pollen";

export type DataPoint = {
    label: string;
    value: number;
    tierValue: number;
    paidValue: number;
    timestamp: Date;
    fullDate: string;
};
