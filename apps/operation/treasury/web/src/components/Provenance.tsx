export type ProvenanceCode = "EN" | "TB" | "ST" | "API" | "CLI" | "BQ" | "HC";

const PROVENANCE: Record<
    ProvenanceCode,
    { title: string; className: string; display?: string }
> = {
    EN: {
        title: "Enty - monthly transactions export",
        className: "treasury-source-en",
    },
    TB: {
        title: "Tinybird - generation event usage",
        className: "treasury-source-tb",
    },
    ST: {
        title: "Stripe - revenue and fees, live on refresh",
        className: "treasury-source-st",
    },
    API: {
        title: "Provider API - read live on refresh",
        className: "treasury-source-api",
    },
    CLI: {
        title: "Provider CLI - read live on refresh",
        className: "treasury-source-cli",
    },
    BQ: {
        title: "BigQuery - provider usage export",
        className: "treasury-source-bq",
    },
    HC: {
        title: "Manual, hardcoded, or operator-corrected value",
        className: "treasury-source-hc",
    },
};

export function SourceMark({ code }: { code: ProvenanceCode }) {
    const source = PROVENANCE[code];

    return (
        <span
            className={`treasury-source-badge ${source.className}`}
            title={source.title}
        >
            {source.display ?? code}
        </span>
    );
}
