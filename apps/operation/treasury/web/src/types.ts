export type CoverageRow = {
    month: string;
    provider: string;
    status: string;
    invoice_usd: number;
    payment_usd: number;
};

export type GapRow = CoverageRow & {
    delta_usd: number;
};

export type InvoiceRow = {
    sha256: string;
    provider: string;
    category: string;
    period_month: string;
    amount: number;
    currency: string;
    credit_usd: number;
    invoice_number: string;
    issued_at: string;
    file_ref: string;
};

export type GrantRow = {
    pool: string;
    providers: string;
    category: string;
    left_usd: number | null;
    left_src: string;
    prepaid_left_usd: number | null;
    prepaid_left_src: string;
    expires: string;
};

export type PaymentTxRow = {
    paid_at: string;
    provider: string;
    category: string;
    counterparty: string;
    amount_eur: number;
};

export type MeterMonthlyRow = {
    month: string;
    provider: string;
    cash_burn_usd: number;
    cash_src: string;
    credit_burn_usd: number;
    credit_src: string;
};

export type UsageMonthlyRow = {
    month: string;
    provider: string;
    model: string;
    billable_requests_paid_pollen: number;
    billable_requests_quest_pollen: number;
    cost_paid_pollen: number;
    cost_quest_pollen: number;
    billable_paid_pollen: number;
    billable_quest_pollen: number;
};

export type RunRow = {
    run_at: string;
    ok: number;
    statuses: string;
};

// One curated mapping row: a raw string seen in the data (a Wise counterparty,
// an invoice sender, a model tag) assigned to a canonical provider/category.
export type ProviderAliasRow = {
    alias: string;
    provider: string;
};

export type Data = {
    coverage: CoverageRow[];
    gaps: GapRow[];
    invoices: InvoiceRow[];
    paymentsTx: PaymentTxRow[];
    meterMonthly: MeterMonthlyRow[];
    grants: GrantRow[];
    usageMonthly: UsageMonthlyRow[];
    runs: RunRow[];
    providerAliases: ProviderAliasRow[];
};
