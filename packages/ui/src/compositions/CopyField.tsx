import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import {
    CopyButton,
    type CopyButtonProps,
    CopyStateIcon,
} from "./CopyButton.tsx";

// `md` sits among form fields; `sm` sits among small buttons and labels, as a
// grey pill the height and fill of a small neutral Button (its radius is half
// that height, so a value that wraps keeps soft corners).
const sizeClasses = {
    md: "polli:min-h-10 polli:gap-3 polli:rounded-lg polli:border polli:border-divider polli:bg-theme-bg-pale polli:px-3 polli:py-2 polli:text-theme-text-base polli:hover:text-theme-text-strong",
    sm: "polli:min-h-7 polli:gap-2 polli:rounded-[0.875rem] polli:bg-theme-bg-subtle polli:px-3 polli:py-1 polli:text-theme-text-base polli:hover:bg-theme-text-muted/25 polli:hover:text-theme-text-strong",
} as const;

export type CopyFieldProps = Pick<
    CopyButtonProps,
    "value" | "onCopied" | "onCopyError"
> & {
    /** Accessible name, e.g. "Copy secret key". */
    label: string;
    /** What to show; defaults to a string value or the label for lazy values. */
    display?: ReactNode;
    /** `md` (default) looks like a field; `sm` like a small button. */
    size?: keyof typeof sizeClasses;
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
    size = "md",
    className,
    ...copy
}: CopyFieldProps) {
    return (
        <CopyButton
            {...copy}
            value={value}
            aria-label={label}
            className={cn(
                "polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:text-left polli:font-mono polli:text-xs polli:transition-colors",
                sizeClasses[size],
                "polli:outline-none polli:focus-visible:outline-2 polli:focus-visible:-outline-offset-1 polli:focus-visible:outline-[var(--polli-color-focus)]",
                className,
            )}
        >
            {(copied) => (
                <>
                    {/* A command wraps between its words; an id with no
                        spaces still wraps anywhere rather than overflow. */}
                    <span className="polli:min-w-0 polli:flex-1 polli:wrap-anywhere">
                        {display ?? (typeof value === "string" ? value : label)}
                    </span>
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:flex polli:shrink-0 polli:[&>svg]:size-full",
                            size === "sm" ? "polli:size-3.5" : "polli:size-4",
                        )}
                    >
                        <CopyStateIcon copied={copied} />
                    </span>
                </>
            )}
        </CopyButton>
    );
}
