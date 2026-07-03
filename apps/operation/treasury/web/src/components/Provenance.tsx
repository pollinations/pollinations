import type { ReactNode } from "react";

export type ProvenanceCode =
    | "TB"
    | "WS"
    | "ST"
    | "API"
    | "GH"
    | "CF"
    | "IV"
    | "HC"
    | "UNV"
    | "EQ";

const PROVENANCE: Record<
    ProvenanceCode,
    { title: string; className: string; display?: string }
> = {
    TB: {
        title: "Tinybird - pipe output or usage-derived row",
        className: "treasury-source-tb",
    },
    WS: {
        title: "Wise - real bank cash, live on refresh",
        className: "treasury-source-ws",
    },
    ST: {
        title: "Stripe - revenue and fees, live on refresh",
        className: "treasury-source-st",
    },
    API: {
        title: "Provider API/CLI - read live on refresh",
        className: "treasury-source-api",
    },
    GH: {
        title: "GitHub - registry source",
        className: "treasury-source-gh",
    },
    CF: {
        title: "Cloudflare - source connector",
        className: "treasury-source-cf",
    },
    IV: {
        title: "Invoice or ledger PDF - ingested document value",
        className: "treasury-source-iv",
    },
    HC: {
        title: "Manual, hardcoded, or operator-corrected value",
        className: "treasury-source-hc",
    },
    UNV: {
        title: "Unverified figure on file",
        className: "treasury-source-unv",
    },
    EQ: {
        title: "Computed upstream from other source columns",
        display: "=",
        className: "treasury-source-eq",
    },
};

const SOURCE_CLASS: Record<string, string> = {
    api: "treasury-source-api",
    cli: "treasury-source-cli",
    bq: "treasury-source-bq",
    email: "treasury-source-iv",
    inbox: "treasury-source-iv",
    invoice: "treasury-source-iv",
    ledger: "treasury-source-iv",
    pdf: "treasury-source-iv",
    label: "treasury-source-hc",
    manual: "treasury-source-hc",
    hc: "treasury-source-hc",
    static: "treasury-source-hc",
    wise: "treasury-source-ws",
    ws: "treasury-source-ws",
    stripe: "treasury-source-st",
    st: "treasury-source-st",
    tinybird: "treasury-source-tb",
    tb: "treasury-source-tb",
    estimate: "treasury-source-tb",
};

const SOURCE_DISPLAY: Record<string, string> = {
    email: "IV",
    inbox: "IV",
    invoice: "IV",
    ledger: "IV",
    pdf: "IV",
    label: "HC",
    manual: "HC",
    hc: "HC",
    static: "HC",
    wise: "WS",
    ws: "WS",
    stripe: "ST",
    st: "ST",
    tinybird: "TB",
    tb: "TB",
    estimate: "TB",
};

export function provenanceTitle(code: ProvenanceCode) {
    return PROVENANCE[code].title;
}

export function sourceCode(source: string): ProvenanceCode {
    const normalized = source.toLowerCase();
    if (["email", "inbox", "invoice", "ledger", "pdf"].includes(normalized)) {
        return "IV";
    }
    if (["label", "manual", "hc", "static"].includes(normalized)) return "HC";
    if (["api", "cli", "bq"].includes(normalized)) return "API";
    if (["wise", "ws"].includes(normalized)) return "WS";
    if (["stripe", "st"].includes(normalized)) return "ST";
    if (["tinybird", "tb", "estimate"].includes(normalized)) return "TB";
    return "UNV";
}

function sourceClass(source: string, fallbackCode: ProvenanceCode) {
    return (
        SOURCE_CLASS[source.toLowerCase()] ?? PROVENANCE[fallbackCode].className
    );
}

function sourceDisplay(source: string) {
    return SOURCE_DISPLAY[source.toLowerCase()] ?? source;
}

function sourceTitle(source: string, code: ProvenanceCode) {
    const display = sourceDisplay(source);
    const title = PROVENANCE[code].title;

    return display === source
        ? `${source}: ${title}`
        : `${display}: ${title} (raw source: ${source})`;
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

export function SourceBadge({ source }: { source: string }) {
    if (!source) return <span>-</span>;

    const code = sourceCode(source);

    return (
        <span
            className={`treasury-source-badge ${sourceClass(source, code)}`}
            title={sourceTitle(source, code)}
        >
            {source}
        </span>
    );
}

export function InlineSourceBadge({ source }: { source: string }) {
    if (!source) return null;

    const code = sourceCode(source);

    return (
        <span
            className={`treasury-source-badge ${sourceClass(source, code)}`}
            title={sourceTitle(source, code)}
        >
            {sourceDisplay(source)}
        </span>
    );
}

export function ValueWithSource({
    children,
    source,
}: {
    children: ReactNode;
    source: string;
}) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
            <span>{children}</span>
            <InlineSourceBadge source={source} />
        </span>
    );
}

export function ValueWithSources({
    children,
    codes,
}: {
    children: ReactNode;
    codes: ProvenanceCode[];
}) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
            <span>{children}</span>
            {codes.map((code) => (
                <SourceMark key={code} code={code} />
            ))}
        </span>
    );
}

export function HeaderWithSources({
    children,
    codes,
}: {
    children: ReactNode;
    codes: ProvenanceCode[];
}) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span>{children}</span>
            {codes.map((code) => (
                <SourceMark key={code} code={code} />
            ))}
        </span>
    );
}
