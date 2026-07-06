export type TransactionRow = {
    date: string;
    vendor: string;
    category: string;
    charged_amount: number;
    charged_currency: string;
    paid_amount: number;
    paid_currency: string;
    invoice_ref: string;
    match_status: string;
};

export type ProviderMonthlyRow = {
    month: string;
    vendor: string;
    currency: string;
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

export type Data = {
    transactions: TransactionRow[];
    providerMonthly: ProviderMonthlyRow[];
    pollenMonthly: PollenMonthlyRow[];
    runs: RunRow[];
    revenueMonthly: RevenueMonthlyRow[];
};
