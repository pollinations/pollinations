import { CopyButton, cn } from "@pollinations/ui";
import type { FC } from "react";

export const KeyDisplay: FC<{ fullKey: string; start: string }> = ({
    fullKey,
    start,
}) => {
    return (
        <CopyButton
            value={fullKey}
            tooltip="📋 Copy full key"
            tooltipClassName="inline-flex"
            aria-label="Copy full API key"
            className={(copied) =>
                cn(
                    "font-mono text-xs text-left cursor-pointer transition-all",
                    copied
                        ? "text-intent-success-text font-semibold"
                        : "text-theme-text-soft hover:text-theme-text-strong hover:underline",
                )
            }
        >
            {(copied) => (copied ? "✓ Copied!" : `${start}...`)}
        </CopyButton>
    );
};
