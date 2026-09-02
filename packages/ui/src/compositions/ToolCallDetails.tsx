import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Text } from "../primitives/Typography.tsx";

export type ToolCallStatus = "running" | "complete" | "error";

export interface ToolCallDetailsProps {
    name: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    status?: ToolCallStatus;
    defaultOpen?: boolean;
    className?: string;
}

function formattedValue(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function linkedValue(value: unknown): ReactNode[] {
    const formatted = formattedValue(value);
    const segments = formatted.split(/(https:\/\/[^\s"\\]+)/g);
    let offset = 0;
    return segments.map((segment) => {
        const key = `${offset}:${segment}`;
        offset += segment.length;
        return segment.startsWith("https://") ? (
            <a
                key={key}
                href={segment}
                target="_blank"
                rel="noopener noreferrer"
                className="polli:underline"
            >
                {segment}
            </a>
        ) : (
            segment
        );
    });
}

function ToolValue({ value }: { value: unknown }) {
    return (
        <pre className="polli:max-h-72 polli:overflow-auto polli:whitespace-pre-wrap polli:break-words polli:rounded-lg polli:bg-theme-bg-pale polli:p-3 polli:text-xs">
            {linkedValue(value)}
        </pre>
    );
}

const STATUS_LABELS: Record<ToolCallStatus, string> = {
    running: "Running tool",
    complete: "Tool executed",
    error: "Tool failed",
};

/** Framework-neutral disclosure for server- or client-executed tool calls. */
export function ToolCallDetails({
    name,
    input,
    output,
    error,
    status = error === undefined ? "complete" : "error",
    defaultOpen = false,
    className,
}: ToolCallDetailsProps) {
    const result = error === undefined ? output : error;
    return (
        <details
            open={defaultOpen}
            className={cn(
                "polli:group polli:overflow-hidden polli:rounded-lg polli:border polli:border-theme-border/40 polli:bg-theme-bg-pale",
                className,
            )}
        >
            <summary className="polli:flex polli:cursor-pointer polli:list-none polli:items-center polli:gap-2 polli:px-3 polli:py-2 polli:text-sm polli:font-semibold polli:[&::-webkit-details-marker]:hidden">
                <ChevronIcon className="polli:group-open:rotate-180" />
                <span>{STATUS_LABELS[status]}</span>
                <code className="polli:min-w-0 polli:truncate polli:text-xs polli:font-normal">
                    {name}
                </code>
            </summary>
            <div className="polli:flex polli:flex-col polli:gap-3 polli:border-theme-border/40 polli:border-t polli:px-3 polli:py-3">
                {input !== undefined && (
                    <div className="polli:flex polli:flex-col polli:gap-1">
                        <Text size="xs" tone="muted" weight="bold">
                            Input
                        </Text>
                        <ToolValue value={input} />
                    </div>
                )}
                {result !== undefined && (
                    <div className="polli:flex polli:flex-col polli:gap-1">
                        <Text size="xs" tone="muted" weight="bold">
                            {error === undefined ? "Output" : "Error"}
                        </Text>
                        <ToolValue value={result} />
                    </div>
                )}
            </div>
        </details>
    );
}
