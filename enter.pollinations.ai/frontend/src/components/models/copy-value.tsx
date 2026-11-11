import { CopyButton, CopyStateIcon, cn } from "@pollinations/ui";
import type { FC } from "react";

type CopyValueProps = {
    value: string;
    label: string;
    showCopyIcon?: boolean;
};

export const CopyValue: FC<CopyValueProps> = ({
    value,
    label,
    showCopyIcon = false,
}) => (
    <CopyButton
        value={value}
        tooltip={showCopyIcon ? null : undefined}
        aria-label={label}
        tooltipAlign="start"
        tooltipMaxWidth={520}
        tooltipClassName="min-w-0 max-w-full"
        className={(copied) =>
            cn(
                "pointer-events-auto flex min-w-0 max-w-full cursor-pointer text-left font-mono text-xs font-medium transition-colors",
                copied
                    ? "text-intent-success-text"
                    : "text-theme-text-muted hover:text-theme-text-soft",
            )
        }
    >
        {(copied) => (
            <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{value}</span>
                {showCopyIcon && (
                    <CopyStateIcon
                        copied={copied}
                        className="h-3.5 w-3.5 shrink-0"
                    />
                )}
                {showCopyIcon && copied && (
                    <span className="sr-only">Copied</span>
                )}
            </span>
        )}
    </CopyButton>
);
