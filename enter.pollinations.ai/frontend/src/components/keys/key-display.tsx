import { CopyButton, cn } from "@pollinations/ui";
import type { FC } from "react";

export const KeyDisplay: FC<{ fullKey: string; start: string }> = ({
    fullKey,
    start,
}) => {
    return (
        <CopyButton
            value={fullKey}
            tooltip="Click to copy full key"
            tooltipClassName="inline-flex"
            aria-label="Copy full API key"
            className={(copied) =>
                cn(
                    "font-mono text-xs text-left cursor-pointer transition-all",
                    copied
                        ? "text-green-600 font-semibold"
                        : "text-blue-600 hover:text-blue-800 hover:underline",
                )
            }
        >
            {(copied) => (copied ? "✓ Copied!" : `${start}...`)}
        </CopyButton>
    );
};
