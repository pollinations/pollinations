export type ProvenanceCode = "TB" | "ST" | "API" | "CLI" | "BQ" | "HC";

const PROVENANCE: Record<
    ProvenanceCode,
    { title: string; className: string; display?: string }
> = {
    TB: {
        title: "Tinybird - pipe output or usage-derived row",
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

const SOURCE_META: Record<
    string,
    { code: ProvenanceCode; display: string; title?: string }
> = {
    api: { code: "API", display: "API" },
    cli: { code: "CLI", display: "CLI" },
    bq: { code: "BQ", display: "BQ" },
    manual: { code: "HC", display: "HC" },
    hc: { code: "HC", display: "HC" },
    stripe: { code: "ST", display: "ST" },
    st: { code: "ST", display: "ST" },
    tinybird: { code: "TB", display: "TB" },
    tb: { code: "TB", display: "TB" },
    usage: {
        code: "TB",
        display: "TB",
        title: "Pollen usage exists for this provider/month, but provider usage is missing; zero row is generated for operator fill-in.",
    },
};

function sourceMeta(source: string) {
    const normalized = source.toLowerCase();
    const meta = SOURCE_META[normalized];
    if (!meta) {
        throw new Error(`Unknown source badge: ${source}`);
    }
    return meta;
}

function sourceTitle(source: string, code: ProvenanceCode, custom?: string) {
    return custom ?? `${source}: ${PROVENANCE[code].title}`;
}

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

export function InlineSourceBadge({ source }: { source: string }) {
    if (!source) return null;

    const meta = sourceMeta(source);
    const provenance = PROVENANCE[meta.code];

    return (
        <span
            className={`treasury-source-badge ${provenance.className}`}
            title={sourceTitle(source, meta.code, meta.title)}
        >
            {meta.display}
        </span>
    );
}

function normalizeSource(source: string) {
    const normalized = source.trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "mixed") return "";
    return normalized;
}

export function uniqueSources(sources: readonly (string | null | undefined)[]) {
    const normalized = sources
        .flatMap((source) => (source ?? "").split(/[,+/ ]+/))
        .map(normalizeSource)
        .filter(Boolean);
    return [...new Set(normalized)];
}

export function SourceCell({
    sources,
}: {
    sources: readonly (string | null | undefined)[];
}) {
    const unique = uniqueSources(sources);
    if (unique.length === 0) return <span>-</span>;

    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
            {unique.map((source) => (
                <InlineSourceBadge key={source} source={source} />
            ))}
        </span>
    );
}
