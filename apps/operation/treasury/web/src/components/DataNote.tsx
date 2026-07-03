import { Chip, Text } from "@pollinations/ui";

type DataNoteProps = {
    pipe: string;
    rows: number;
    source: string;
    transform: string;
    purpose: string;
};

export function DataNote({
    pipe,
    rows,
    source,
    transform,
    purpose,
}: DataNoteProps) {
    return (
        <section className="rounded-md border border-theme-border/70 bg-theme-bg/35 p-4">
            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Text
                        size="sm"
                        weight="bold"
                        className="font-mono text-theme-text-strong"
                    >
                        {pipe}
                    </Text>
                    <Chip size="sm">{rows} rows</Chip>
                </div>
                <Text size="sm" tone="soft">
                    {purpose}
                </Text>
            </div>
            <div className="mt-3 flex flex-wrap items-stretch gap-2">
                <FlowNode label="source" value={source} />
                <FlowArrow />
                <FlowNode label="build" value={transform} />
                <FlowArrow />
                <FlowNode label="output" value={`TB:${pipe}`} />
            </div>
        </section>
    );
}

function FlowNode({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded border border-theme-border/70 bg-theme-bg/55 px-3 py-2">
            <Text
                as="span"
                size="micro"
                tone="soft"
                weight="bold"
                className="block uppercase tracking-wide"
            >
                {label}
            </Text>
            <Text as="span" size="sm" className="mt-1 block">
                {value}
            </Text>
        </div>
    );
}

function FlowArrow() {
    return (
        <div className="flex items-center px-0.5 font-mono text-sm font-bold text-theme-text-soft">
            -&gt;
        </div>
    );
}
