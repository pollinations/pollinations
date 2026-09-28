import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { CheckIcon, ClipboardIcon } from "../primitives/icons/index.tsx";
import { CopyButton, type CopyButtonProps } from "./CopyButton.tsx";

export type CopyFieldProps = Pick<
    CopyButtonProps,
    "value" | "onCopied" | "onCopyError" | "copiedTimeoutMs"
> & {
    /** Accessible name, e.g. "Copy secret key". */
    label: string;
    /** What to show; defaults to the value itself (lists pass a truncated form). */
    display?: ReactNode;
    className?: string;
};

/**
 * A value the user copies but never edits: looks like a field, behaves like a
 * button. The whole surface copies on click; the end icon confirms.
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
            className={(copied) =>
                cn(
                    "polli-input-shell polli:flex polli:min-h-10 polli:w-full polli:cursor-pointer polli:items-center polli:gap-3 polli:rounded-lg polli:border polli:px-3 polli:py-2 polli:text-left polli:font-mono polli:text-xs polli:transition-colors",
                    copied
                        ? "polli:text-intent-success-text"
                        : "polli:text-theme-text-base polli:hover:text-theme-text-strong",
                    className,
                )
            }
        >
            {(copied) => (
                <>
                    <span className="polli:min-w-0 polli:flex-1 polli:select-all polli:break-all">
                        {copied ? "Copied" : (display ?? String(value))}
                    </span>
                    <span
                        aria-hidden="true"
                        className="polli:flex polli:size-4 polli:shrink-0 polli:[&>svg]:size-full"
                    >
                        {copied ? <CheckIcon /> : <ClipboardIcon />}
                    </span>
                </>
            )}
        </CopyButton>
    );
}
