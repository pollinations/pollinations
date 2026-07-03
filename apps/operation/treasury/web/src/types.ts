export type CoverageRow = {
    month: string;
    provider: string;
    billing: string;
    status: string;
    invoice_usd: number;
    payment_usd: number;
};

export type GapRow = CoverageRow & {
    delta_usd: number;
    invoice_refs: string;
    payment_refs: string;
    note: string;
};

export type InvoiceRow = {
    sha256: string;
    provider: string;
    category: string;
    kind: string;
    period_month: string;
    amount: number;
    currency: string;
    amount_usd: number;
    credit_usd: number;
    invoice_number: string;
    issued_at: string;
    source: string;
    file_ref: string;
    status: string;
    ingested_at: string;
};

export type GrantRow = {
    pool: string;
    providers: string;
    kind: string;
    category: string;
    currency: string;
    granted_usd: number | null;
    granted_src: string;
    left_usd: number | null;
    left_src: string;
    prepaid_left_usd: number | null;
    prepaid_left_src: string;
    expires: string;
    note: string;
    run_at: string;
};

export type CashMonthlyRow = {
    month: string;
    provider: string;
    category: string;
    paid_usd: number;
    paid_eur: number;
};

export type ProviderMonthRow = {
    month: string;
    provider: string;
    category: string;
    invoice_usd: number;
    meter_cash_usd: number;
    meter_prepaid_usd: number;
    meter_src: string;
    usage_cost_usd: number;
    credit_burn_usd: number;
    credit_src: string;
    status: string;
};

export type BalanceRow = {
    provider: string;
    granted_usd: number | null;
    spent_usd: number | null;
    left_usd: number | null;
    prepaid_left_usd: number | null;
    source: string;
    note: string;
    last_run_at: string;
};

export type RunRow = {
    run_at: string;
    ok: number;
    statuses: string;
    notes: string;
};

export type Data = {
    coverage: CoverageRow[];
    gaps: GapRow[];
    invoices: InvoiceRow[];
    cashMonthly: CashMonthlyRow[];
    grants: GrantRow[];
    balances: BalanceRow[];
    providerMonths: ProviderMonthRow[];
    runs: RunRow[];
};
