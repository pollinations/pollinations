export type TransactionRow = {
    date: string;
    vendor: string;
    category: string;
    charged_amount: number;
    charged_currency: string;
};

export type ProviderMonthlyRow = {
    month: string;
    vendor: string;
    currency: string;
    // "compute" | "infra"; rows that predate the column count as compute
    category?: string;
    credit: number;
    paid: number;
    source: string;
};

export type PollenMonthlyRow = {
    source: string;
    month: string;
    vendor: string;
    model: string;
    currency: string;
    cost_paid: number;
    cost_quests: number;
    price_paid: number;
    price_quests: number;
    byop_paid: number;
    byop_quests: number;
    model_paid: number;
    model_quests: number;
    requests: number;
};

export type GrantRow = {
    vendor: string;
    label: string;
    granted: number;
    currency: string;
    start_date: string;
    // 1970-01-01 = no expiry (sentinel from the grants datasource)
    expires: string;
};

export type RunRow = {
    run_at: string;
    ok: number;
    statuses: string;
    notes: string;
};

export type RevenueMonthlyRow = {
    source: string;
    month: string;
    currency: string;
    gross_amount: number;
    fees_amount: number;
    refunds_amount: number;
};

export type GpuFleetRow = {
    recorded_at: string; // "YYYY-MM-DD HH:MM:SS"
    vendor: string;
    deployment: string;
    gpu: string;
    gpu_count: number;
    usd_per_hr: number;
    balance_usd: number | null;
};

export type GpuBillingRow = {
    month: string;
    vendor: string;
    deployment: string;
    gpu: string;
    amount: number;
    currency: string;
    source: string;
};

export type GpuRunRow = {
    month: string; // "YYYY-MM"
    vendor: string;
    run_id: string;
    deployment: string;
    gpu: string; // "" when the provider hides it
    gpu_count: number;
    started_at: string; // "YYYY-MM-DD HH:MM:SS" or "" (unknown)
    ended_at: string; // "" = still running / unknown
    hours: number | null; // null = serverless / unknown
    cost: number;
    currency: string; // USD or EUR
    model: string; // comma-joined model list; "" = unmapped
    kind: string; // "gpu" | "serverless"
    source: string; // "api" | "cli" | "manual"
};

export type Data = {
    transactions: TransactionRow[];
    providerMonthly: ProviderMonthlyRow[];
    pollenMonthly: PollenMonthlyRow[];
    grants: GrantRow[];
    runs: RunRow[];
    revenueMonthly: RevenueMonthlyRow[];
    gpuFleet: GpuFleetRow[];
    gpuBilling: GpuBillingRow[];
    gpuRuns: GpuRunRow[];
};
