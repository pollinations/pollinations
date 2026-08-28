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

export type OpCloudRow = {
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
};

export type PrivateForecastRule = {
    fixedAmounts?: ForecastAmount[];
    activeFrom?: string;
    activeThrough?: string;
    scheduledAmounts?: ScheduledForecastAmount[];
};

export type ProviderCheckExplanation = {
    month: string;
    provider: string;
    reason: "unverifiable_history";
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

export type EconomicsPrivateConfig = {
    forecastRules: Record<string, PrivateForecastRule>;
    reconciliation: {
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
    opCloud?: OpCloudRow[];
    opPollen?: OpPollenRow[];
    providerObservations?: ProviderObservation[];
    privateConfig?: EconomicsPrivateConfig;
};
