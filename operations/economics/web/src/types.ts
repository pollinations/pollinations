export type OpTransactionRow = {
    entry_id: string;
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

export type OpRunwayRow = {
    entry_id: string;
    kind: "opening_balance" | "forecast" | string;
    date: string;
    vendor: string;
    category: string;
    amount: number;
    currency: string;
    source: string;
    evidence: string;
    recorded_at: string;
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

export type Data = {
    opTransactions?: OpTransactionRow[];
    opCloud?: OpCloudRow[];
    opPollen?: OpPollenRow[];
    opRunway?: OpRunwayRow[];
    providerObservations?: ProviderObservation[];
};
