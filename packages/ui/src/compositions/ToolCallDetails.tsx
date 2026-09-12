import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import {
    CheckIcon,
    ClockIcon,
    ToolIcon,
    XIcon,
} from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

export type ToolCallStatus =
    | "pending"
    | "running"
    | "approval-requested"
    | "approval-responded"
    | "complete"
    | "error"
    | "denied";

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

function ToolValue({
    value,
    error = false,
}: {
    value: unknown;
    error?: boolean;
}) {
    return (
        <pre
            className={cn(
                "polli:max-h-72 polli:overflow-auto polli:whitespace-pre-wrap polli:break-words polli:rounded-lg polli:border polli:p-3 polli:text-xs polli:leading-relaxed",
                error
                    ? "polli:border-intent-danger-border/30 polli:bg-intent-danger-bg-light polli:text-intent-danger-text"
                    : "polli:border-theme-border/20 polli:bg-theme-bg-pale polli:text-theme-text-base",
            )}
        >
            {linkedValue(value)}
        </pre>
    );
}

const STATUS_LABELS: Record<ToolCallStatus, string> = {
    pending: "Pending",
    running: "Running",
    "approval-requested": "Awaiting approval",
    "approval-responded": "Responded",
    complete: "Completed",
    error: "Error",
    denied: "Denied",
};

function ToolStatus({ status }: { status: ToolCallStatus }) {
    const icon =
        status === "complete" || status === "approval-responded" ? (
            <CheckIcon className="polli:size-3" />
        ) : status === "error" || status === "denied" ? (
            <XIcon className="polli:size-3" />
        ) : (
            <ClockIcon
                className={cn(
                    "polli:size-3",
                    status === "running" && "polli:animate-pulse",
                )}
            />
        );
    return (
        <span
            data-status={status}
            className={cn(
                "polli:ml-auto polli:inline-flex polli:shrink-0 polli:items-center polli:gap-1 polli:rounded-full polli:px-2 polli:py-1 polli:text-[11px] polli:font-semibold",
                status === "complete" || status === "approval-responded"
                    ? "polli:bg-theme-bg-active polli:text-intent-success-text"
                    : status === "error" || status === "denied"
                      ? "polli:bg-intent-danger-bg-light polli:text-intent-danger-text"
                      : "polli:bg-intent-info-bg-light polli:text-intent-info-text",
            )}
        >
            {icon}
            {STATUS_LABELS[status]}
        </span>
    );
}

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
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div
            data-tool-status={status}
            className={cn(
                "polli:overflow-hidden polli:rounded-xl polli:border polli:border-theme-border/35 polli:bg-surface-opaque polli:shadow-well",
                className,
            )}
        >
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className="polli-control polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:gap-2 polli:px-3 polli:py-2.5 polli:text-left polli:hover:bg-theme-bg-hover/50"
            >
                <span className="polli:flex polli:size-7 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-lg polli:bg-theme-bg-active polli:text-theme-text-strong">
                    <ToolIcon className="polli:size-3.5" />
                </span>
                <code className="polli:min-w-0 polli:truncate polli:text-xs polli:font-semibold polli:text-theme-text-strong">
                    {name}
                </code>
                <ToolStatus status={status} />
                <ChevronIcon
                    expanded={open}
                    className="polli:size-4 polli:shrink-0 polli:text-theme-text-soft"
                />
            </button>
            {open && (
                <div className="polli:flex polli:flex-col polli:gap-4 polli:border-theme-border/30 polli:border-t polli:bg-theme-bg-pale/35 polli:px-3 polli:py-3">
                    {input !== undefined && (
                        <div className="polli:flex polli:flex-col polli:gap-1">
                            <Text size="xs" tone="muted" weight="bold">
                                Parameters
                            </Text>
                            <ToolValue value={input} />
                        </div>
                    )}
                    {result !== undefined && (
                        <div className="polli:flex polli:flex-col polli:gap-1">
                            <Text size="xs" tone="muted" weight="bold">
                                {error === undefined ? "Result" : "Error"}
                            </Text>
                            <ToolValue
                                value={result}
                                error={error !== undefined}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
