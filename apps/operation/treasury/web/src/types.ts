export type TransactionRow = {
    date: string;
    provider: string;
    category: string;
    bank_charged_amount: number;
    bank_charged_currency: string;
    cash_paid_amount: number;
    cash_paid_currency: string;
    credit_burned_amount: number;
    credit_burned_currency: string;
    invoice_ref: string;
    match_status: string;
};

export type MeterMonthlyRow = {
    month: string;
    provider: string;
    currency: string;
    credit_amount: number;
    cash_amount: number;
    source: string;
};

export type UsageMonthlyRow = {
    source: string;
    month: string;
    provider: string;
    model: string;
    currency: string;
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
    currency: string;
    gross_amount: number;
    fees_amount: number;
    refunds_amount: number;
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
