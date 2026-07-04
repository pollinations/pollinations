import { Text, Tooltip } from "@pollinations/ui";
import type { ProvenanceCode } from "./Provenance";
import { SourceBadge, SourceMark } from "./Provenance";

const CODE_LABELS: { code: ProvenanceCode; text: string }[] = [
    { code: "TB", text: "Tinybird" },
    { code: "IV", text: "invoice PDF" },
    { code: "WS", text: "Wise" },
    { code: "EQ", text: "computed upstream" },
    { code: "HC", text: "manual / hardcoded" },
];

const SOURCE_LABELS = [
    { source: "api", text: "provider API" },
    { source: "cli", text: "provider CLI" },
    { source: "bq", text: "BigQuery" },
];

export function SourceLegendContent() {
    return (
        <span className="flex flex-col gap-1.5 p-1">
            {[...CODE_LABELS, ...SOURCE_LABELS].map((item) => (
                <span
                    key={"code" in item ? item.code : item.source}
                    className="inline-flex items-center gap-1.5"
                >
                    {"code" in item ? (
                        <SourceMark code={item.code} />
                    ) : (
                        <SourceBadge source={item.source} />
                    )}
                    <Text as="span" size="sm" tone="soft">
                        {item.text}
                    </Text>
                </span>
            ))}
        </span>
    );
}

// Big round "i": the chip legend lives in its hover popup instead of a
// permanent row under the title.
export function SourceLegend() {
    return (
        <Tooltip
            ariaLabel="What the source chips mean"
            content={<SourceLegendContent />}
        >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-theme-border bg-theme-bg-active text-xs font-bold leading-none text-theme-text-strong transition-colors hover:bg-theme-bg-hover">
                i
            </span>
        </Tooltip>
    );
}
