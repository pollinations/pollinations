import { Text } from "@pollinations/ui";
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

export function SourceLegend() {
    return (
        <div className="mt-4 flex max-w-5xl flex-wrap gap-x-4 gap-y-2">
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
        </div>
    );
}
