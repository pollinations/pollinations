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
    source: string;
    file_ref: string;
    status: string;
    ingested_at: string;
};

export type PaymentTxRow = {
    paid_at: string;
    provider: string;
    category: string;
    counterparty: string;
    amount_eur: number;
    wise_ref: string;
};

export type MeterMonthlyRow = {
    month: string;
    provider: string;
    cost_usd: number;
    funding: string;
    source: string;
};

export type UsageMonthlyRow = {
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
    month: string;
    gross_eur: number;
    fees_eur: number;
    refunds_eur: number;
};

export type Data = {
    coverage: CoverageRow[];
    gaps: GapRow[];
    invoices: InvoiceRow[];
    paymentsTx: PaymentTxRow[];
    meterMonthly: MeterMonthlyRow[];
    usageMonthly: UsageMonthlyRow[];
    runs: RunRow[];
    revenueMonthly: RevenueMonthlyRow[];
};
