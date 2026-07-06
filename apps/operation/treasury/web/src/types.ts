export type TransactionRow = {
    date: string;
    provider: string;
    category: string;
    bank_charged: string;
    cash_paid: string;
    credit_burned: string;
    invoice_ref: string;
    match_status: string;
};

export type MeterMonthlyRow = {
    month: string;
    provider: string;
    cost_usd: number;
    funding: string;
    source: string;
};

export type UsageMonthlyRow = {
    source: string;
    month: string;
    provider: string;
    model: string;
    cost_paid_pollen: number;
    cost_quest_pollen: number;
    billable_paid_pollen: number;
    billable_quest_pollen: number;
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
    gross_eur: number;
    fees_eur: number;
    refunds_eur: number;
};

export type OverrideRow = {
    scope: string;
    key: string;
    field: string;
    value_num: number | null;
    value_str: string;
};

export type Data = {
    transactions: TransactionRow[];
    meterMonthly: MeterMonthlyRow[];
    usageMonthly: UsageMonthlyRow[];
    runs: RunRow[];
    revenueMonthly: RevenueMonthlyRow[];
    overrides: OverrideRow[];
};
