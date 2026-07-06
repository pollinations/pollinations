import { Chip } from "@pollinations/ui";

export type ProvenanceCode = "EN" | "TB" | "ST" | "API" | "CLI" | "BQ" | "HC";

const PROVENANCE: Record<ProvenanceCode, { title: string; display?: string }> =
    {
        EN: {
            title: "Enty - monthly transactions export",
        },
        TB: {
            title: "Tinybird - generation event usage",
        },
        ST: {
            title: "Stripe - revenue and fees, live on refresh",
        },
        API: {
            title: "Vendor API - read live on refresh",
        },
        CLI: {
            title: "Vendor CLI - read live on refresh",
        },
        BQ: {
            title: "BigQuery - vendor usage export",
        },
        HC: {
            title: "Manual, hardcoded, or operator-corrected value",
        },
    };

const SOURCE_META: Record<
    string,
    { code: ProvenanceCode; display: string; title?: string }
> = {
    enty: { code: "EN", display: "EN" },
    en: { code: "EN", display: "EN" },
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
        code: "HC",
        display: "HC",
        title: "Vendor usage is missing; placeholder row is generated for operator fill-in.",
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
        <Chip
            data-theme="neutral"
            intent="neutral"
            size="sm"
            title={source.title}
            className="font-mono"
        >
            {source.display ?? code}
        </Chip>
    );
}

export function InlineSourceBadge({ source }: { source: string }) {
    if (!source) return null;

    const meta = sourceMeta(source);

    return (
        <Chip
            data-theme="neutral"
            intent="neutral"
            size="sm"
            className="font-mono"
            title={sourceTitle(source, meta.code, meta.title)}
        >
            {meta.display}
        </Chip>
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
    const seen = new Set<string>();
    const badges = unique
        .filter((source) => source !== "usage")
        .filter((source) => {
            const meta = sourceMeta(source);
            const key = `${meta.code}:${meta.display}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    if (badges.length === 0) return <span>-</span>;

    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
            {badges.map((source) => (
                <InlineSourceBadge key={source} source={source} />
            ))}
        </span>
    );
}
