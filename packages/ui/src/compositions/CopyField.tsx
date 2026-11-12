import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import {
    CopyButton,
    type CopyButtonProps,
    CopyStateIcon,
} from "./CopyButton.tsx";

export type CopyFieldProps = Pick<
    CopyButtonProps,
    "value" | "onCopied" | "onCopyError" | "copiedTimeoutMs"
> & {
    /** Accessible name, e.g. "Copy secret key". */
    label: string;
    /** What to show; defaults to a string value or the label for lazy values. */
    display?: ReactNode;
    className?: string;
};

/**
 * A value the user copies but never edits: looks like a field, behaves like a
 * button. The whole surface copies on click; only the end icon confirms, so
 * the value stays put. The focus ring is for keyboard focus only, not the
 * click that copied.
 */
export function CopyField({
    value,
    label,
    display,
    className,
    ...copy
}: CopyFieldProps) {
    return (
        <CopyButton
            {...copy}
            value={value}
            tooltip={null}
            aria-label={label}
            className={cn(
                "polli:flex polli:min-h-10 polli:w-full polli:cursor-pointer polli:items-center polli:gap-3 polli:rounded-lg polli:border polli:border-divider polli:bg-theme-bg-pale polli:px-3 polli:py-2 polli:text-left polli:font-mono polli:text-xs polli:text-theme-text-base polli:transition-colors polli:hover:text-theme-text-strong",
                "polli:outline-none polli:focus-visible:outline-2 polli:focus-visible:-outline-offset-1 polli:focus-visible:outline-[var(--polli-color-focus)]",
                className,
            )}
        >
            {(copied) => (
                <>
                    <span className="polli:min-w-0 polli:flex-1 polli:break-all">
                        {display ?? (typeof value === "string" ? value : label)}
                    </span>
                    <span
                        aria-hidden="true"
                        className="polli:flex polli:size-4 polli:shrink-0 polli:[&>svg]:size-full"
                    >
                        <CopyStateIcon copied={copied} />
                    </span>
                    {/* Said, not shown: the icon is the visible answer. */}
                    <span className="polli:sr-only" aria-live="polite">
                        {copied ? "Copied" : ""}
                    </span>
                </>
            )}
        </CopyButton>
    );
}
