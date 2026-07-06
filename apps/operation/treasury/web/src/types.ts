export type TransactionRow = {
    date: string;
    provider: string;
    category: string;
    charged_amount: number;
    charged_currency: string;
    paid_amount: number;
    paid_currency: string;
    invoice_ref: string;
    match_status: string;
};

export type MeterMonthlyRow = {
    month: string;
    provider: string;
    currency: string;
    credit: number;
    paid: number;
    source: string;
};

export type UsageMonthlyRow = {
    source: string;
    month: string;
    provider: string;
    model: string;
    currency: string;
    cost_paid: number;
    cost_quests: number;
    price_paid: number;
    price_quests: number;
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
