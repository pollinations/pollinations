import { Chip } from "@pollinations/ui";
import { sourceMetadata, uniqueSourceNames } from "../lib/provenance";

export type { ProvenanceCode } from "../lib/provenance";

function InlineSourceBadge({ source }: { source: string }) {
    if (!source) return null;

    const meta = sourceMetadata(source);

    if (!meta) {
        return (
            <Chip
                data-theme="neutral"
                intent="danger"
                size="sm"
                className="font-mono"
                title={`Unknown source: ${source}`}
            >
                ? {source}
            </Chip>
        );
    }

    return (
        <Chip
            data-theme="neutral"
            intent="neutral"
            size="sm"
            className="font-mono"
            title={`${source}: ${meta.title}`}
        >
            {meta.display}
        </Chip>
    );
}

export function SourceCell({
    sources,
}: {
    sources: readonly (string | null | undefined)[];
}) {
    const unique = uniqueSourceNames(sources);
    const seen = new Set<string>();
    const badges = unique
        .filter((source) => source !== "usage")
        .filter((source) => {
            const meta = sourceMetadata(source);
            const key = meta
                ? `${meta.code}:${meta.display}`
                : `unknown:${source}`;
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
