import { useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { Chip } from "../primitives/Chip.tsx";

export type KeyPrefixProps = { className?: string };

/** Renders the first 7 chars of the API key followed by bullets. `null` when logged out. */
export function KeyPrefix({ className }: KeyPrefixProps = {}) {
    const { apiKey } = useAuthState();
    if (!apiKey) return null;
    return (
        <Chip
            data-polli="key-prefix"
            className={cn("polli:font-mono polli:select-none", className)}
        >
            {apiKey.slice(0, 7)}
            {"••••••••"}
        </Chip>
    );
}
