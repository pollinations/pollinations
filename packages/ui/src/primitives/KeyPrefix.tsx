import { useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../index.ts";

export type KeyPrefixProps = {
    className?: string;
};

/**
 * Shows the first 4 chars of the current API key followed by bullets. Never
 * exposes the full key. Renders `null` when logged out.
 */
export function KeyPrefix({ className }: KeyPrefixProps) {
    const { apiKey } = useAuthState();
    if (!apiKey) return null;
    return (
        <span
            data-polli="key-prefix"
            className={cn(
                "polli:font-mono polli:text-xs polli:text-theme-text-muted polli:select-none",
                className,
            )}
        >
            {apiKey.slice(0, 4)}
            {"••••••••"}
        </span>
    );
}
