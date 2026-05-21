import { useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";

export type KeyPrefixProps = {
    className?: string;
};

/**
 * Shows the first 7 chars of the current API key followed by bullets — enough
 * to disambiguate between keys (`pk_abc1…`, `pk_xyz9…`) without exposing the
 * full secret. Renders `null` when logged out.
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
            {apiKey.slice(0, 7)}
            {"••••••••"}
        </span>
    );
}
