import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";

export const KeyDisplay: FC<{ fullKey: string; start: string }> = ({
    fullKey,
    start,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_err) {
            // Silently fail
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={cn(
                "font-mono text-xs text-left cursor-pointer transition-all",
                copied
                    ? "text-green-600 font-semibold"
                    : "text-blue-600 hover:text-blue-800 hover:underline",
            )}
            title={copied ? "Copied!" : "Click to copy full key"}
        >
            {copied ? "✓ Copied!" : `${start}...`}
        </button>
    );
};
