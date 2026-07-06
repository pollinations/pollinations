import { Text } from "@pollinations/ui";
import type { ProvenanceCode } from "./Provenance";
import { SourceMark } from "./Provenance";

const CODE_LABELS: { code: ProvenanceCode; text: string }[] = [
    { code: "EN", text: "Enty export" },
    { code: "TB", text: "Pollen usage" },
    { code: "ST", text: "Stripe" },
    { code: "API", text: "provider API" },
    { code: "CLI", text: "provider CLI" },
    { code: "BQ", text: "BigQuery" },
    { code: "HC", text: "manual / placeholder" },
];

export function SourceLegendContent() {
    return (
        <span className="flex flex-col gap-1.5 p-1">
            {CODE_LABELS.map((item) => (
                <span
                    key={item.code}
                    className="inline-flex items-center gap-1.5"
                >
                    <SourceMark code={item.code} />
                    <Text as="span" size="sm" tone="soft">
                        {item.text}
                    </Text>
                </span>
            ))}
        </span>
    );
}
