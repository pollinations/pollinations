export type ProvenanceCode =
    | "EN"
    | "WISE"
    | "TB"
    | "ST"
    | "API"
    | "CLI"
    | "BQ"
    | "HC"
    | "INV"
    | "EXP"
    | "ING"
    | "AGT"
    | "DSH"
    | "REC"
    | "COR"
    | "GRT"
    | "INT";

export type SourceMetadata = {
    code: ProvenanceCode;
    display: string;
    title: string;
};

const PROVENANCE_TITLES: Record<ProvenanceCode, string> = {
    EN: "Enty - monthly transactions export",
    WISE: "Wise - bank activity",
    TB: "Tinybird - generation event usage",
    ST: "Stripe - revenue and fees, live on refresh",
    API: "Vendor API - read live on refresh",
    CLI: "Vendor CLI - read live on refresh",
    BQ: "BigQuery - vendor usage export",
    HC: "Manual, hardcoded, or operator-corrected value",
    INV: "Vendor invoice document - ingest evidence",
    EXP: "Vendor console or billing export - ingest evidence",
    ING: "Ingest batch - agent-extracted evidence entry",
    AGT: "Agent-computed row derived from vendor data during reconcile",
    DSH: "Vendor dashboard or console observation",
    REC: "Reconciled row derived from provider evidence",
    COR: "Operator-approved correction",
    GRT: "Provider grant award evidence",
    INT: "Pollinations internal usage meter",
};

const source = (
    code: ProvenanceCode,
    display = code,
    title = PROVENANCE_TITLES[code],
): SourceMetadata => ({ code, display, title });

const SOURCE_METADATA: Record<string, SourceMetadata> = {
    enty: source("EN"),
    en: source("EN"),
    wise: source("WISE"),
    api: source("API"),
    cli: source("CLI"),
    bq: source("BQ"),
    bigquery: source("BQ"),
    dashboard: source("DSH"),
    reconcile: source("REC"),
    correction: source("COR"),
    grant: source("GRT"),
    internal: source("INT"),
    manual: source("HC"),
    hc: source("HC"),
    stripe: source("ST"),
    st: source("ST"),
    tinybird: source("TB"),
    tb: source("TB"),
    invoice: source("INV"),
    export: source("EXP"),
    ingest: source("ING"),
    agent: source("AGT"),
    usage: source(
        "HC",
        "HC",
        "Vendor usage is missing; placeholder row is generated for operator fill-in.",
    ),
};

export const TRANSACTION_SOURCE_NAMES = new Set(["wise"]);

export const CLOUD_SOURCE_NAMES = new Set([
    "agent",
    "api",
    "bigquery",
    "cli",
    "correction",
    "dashboard",
    "export",
    "grant",
    "ingest",
    "invoice",
    "internal",
    "manual",
    "reconcile",
    "tinybird",
]);

export function normalizeSourceName(value: string): string {
    return value.trim().toLowerCase();
}

export function sourceMetadata(value: string): SourceMetadata | null {
    return SOURCE_METADATA[normalizeSourceName(value)] ?? null;
}

export function isTransactionSource(value: string): boolean {
    return TRANSACTION_SOURCE_NAMES.has(normalizeSourceName(value));
}

export function isCloudSource(value: string): boolean {
    return CLOUD_SOURCE_NAMES.has(normalizeSourceName(value));
}

export function uniqueSourceNames(
    sources: readonly (string | null | undefined)[],
): string[] {
    const normalized = sources
        .flatMap((value) => (value ?? "").split(/[,+/ ]+/))
        .map(normalizeSourceName)
        .filter((value) => value && value !== "mixed");
    return [...new Set(normalized)];
}
