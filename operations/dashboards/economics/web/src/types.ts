export type OpTransactionRow = {
    entry_id: string;
    kind: "transaction" | "opening_balance";
    source: string;
    date: string;
    vendor: string;
    category: string;
    amount: number;
    currency: string;
    description: string;
    evidence: string;
    recorded_at: string;
};

export type VendorLedgerRow = {
    entry_id: string;
    source: string;
    vendor: string;
    account_id?: string;
    account_name?: string;
    type: "inference" | "gpu" | "infra" | string;
    start: string;
    end: string;
    credit: number;
    paid: number;
    currency: string;
    resource_id: string;
    resource_name: string;
    resource_sku: string;
    resource_count: number;
    model: string;
    evidence: string;
    // Planned cash movements are non-posting: paid and credit remain zero.
    plan_amount?: number | null;
    plan_category?: string;
    plan_cadence?: "monthly" | "once" | "";
    settled_by_entry_ids?: string[];
    statement_amount?: number | null;
    compared_entry_ids?: string[];
    comparison_month?: string;
    comparison_basis?: string;
    recorded_at: string;
};

export type OpPollenRow = {
    // The live aggregate endpoint does not emit a source column; fixtures may
    // still name their synthetic source for provenance in tests.
    source?: string;
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
    requests_paid: number;
    requests_quests: number;
};

export type RevenueShareSourceRow = {
    row_type: "summary" | "creator" | "source";
    month: string;
    recipient_id: string;
    github_username: string;
    recipient_name: string;
    sources_json: string;
    paid_usage: number;
    paid_creator_earnings: number;
    paid_pollinations_profit: number;
    // App source rows only: community usage and owner earnings already included.
    paid_community_usage: number;
    paid_model_creator_earnings: number;
    quest_usage: number;
    quest_creator_earnings: number;
    quest_community_usage: number;
    quest_model_creator_earnings: number;
    paid_requests: number;
    quest_requests: number;
};

export type StripeSalesRow = {
    revenue_stream: "pollen" | "kofi";
    reversals: number;
    fraud_refunds?: number;
    fraud_reversals?: number;
    fraud_fees?: number;
    fraud_transactions?: number;
    fraud_evidence?: string[];
    // Absent coverage is unknown, never a completed month.
    coverage_complete?: number;
    coverage_end?: string;
    collected_at?: string;
    missing_accounts?: string;
    count_mismatches?: number;
    enter_unmatched_payments?: number;
    month: string;
    currency: string;
    gross_sales: number;
    refunds: number;
    net_sales: number;
    stripe_fees: number;
    dispute_fees: number;
    net_after_fees: number;
    payments: number;
    refund_count: number;
};

export type UserBalanceSummaryRow = {
    users: number;
    paid_users: number;
    quest_users: number;
    paid_balance: number;
    quest_balance: number;
    synced_at: string;
};

export type ProviderObservationSource = "transactions" | "cloud" | "pollen";

// Captured before provider aliases are canonicalized so the registry can show
// exactly which raw Tinybird names were observed.
export type ProviderObservation = {
    month: string;
    vendor: string;
    source: ProviderObservationSource;
    dashboardChecked: boolean;
    accountId?: string;
};

export type ForecastPaymentTiming = "direct" | "postpaid" | "prepaid";

export type ForecastAmount = {
    amount: number;
    currency: "EUR" | "USD";
};

export type ScheduledForecastAmount = ForecastAmount & {
    month: string;
    note: string;
    settledByEntryIds?: string[];
};

export type PrivateForecastRule = {
    salesStoppedFrom?: Partial<
        Record<StripeSalesRow["revenue_stream"], string>
    >;
    fixedAmounts?: ForecastAmount[];
    activeFrom?: string;
    activeThrough?: string;
    scheduledAmounts?: ScheduledForecastAmount[];
};

export type ProviderCheckExplanation = {
    month: string;
    provider: string;
    reason: "unverifiable_history";
    decision?: "known_limitation";
    explanation: string;
    evidence: string[];
};

export type PollenWitnessExplanation = {
    month: string;
    provider: string;
    reason:
        | "pre_meter_coverage"
        | "provider_attribution_transition"
        | "provider_only_residual"
        | "unverifiable_history";
    explanation: string;
    evidence: string[];
};

export type MeterDriftExplanation = {
    month: string;
    provider: string;
    reason: "historical_tracking_gap";
    explanation: string;
    evidence: string[];
};

export type ArchiveCheck = {
    month: string;
    provider: string;
    account: string;
    checkedAt: string;
    status: "found" | "partial" | "not_found" | "blocked";
    note: string;
    evidence: string[];
};

export type EconomicsPrivateConfig = {
    recordedAt?: string;
    forecastRules: Record<string, PrivateForecastRule>;
    vendorDocuments?: Record<string, string>;
    reviewNotes: {
        planNotes?: { entryId: string; explanation: string }[];
        archiveChecks?: ArchiveCheck[];
        providerCheckExplanations: ProviderCheckExplanation[];
        meterDriftExplanations: MeterDriftExplanation[];
        pollenWitnessExplanations: PollenWitnessExplanation[];
    };
};

export type EconomicsPrivateConfigRow = {
    config: string;
    recorded_at: string;
};

export type Data = {
    opTransactions?: OpTransactionRow[];
    vendorLedger?: VendorLedgerRow[];
    // Non-posting source totals from the same Vendor ledger endpoint.
    vendorStatements?: VendorLedgerRow[];
    vendorPlans?: VendorLedgerRow[];
    opPollen?: OpPollenRow[];
    revenueShare?: RevenueShareSourceRow[];
    stripeSales?: StripeSalesRow[];
    userBalances?: UserBalanceSummaryRow[];
    providerObservations?: ProviderObservation[];
    privateConfig?: EconomicsPrivateConfig;
    planningError?: string;
};
