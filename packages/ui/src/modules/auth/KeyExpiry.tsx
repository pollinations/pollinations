import { useAccountKey, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../../lib/cn.ts";
import { Chip } from "../../primitives/Chip.tsx";

export type KeyExpiryProps = { className?: string };

/** Renders the current delegated key's expiry date (YYYY-MM-DD) or `null`. */
export function KeyExpiry({ className }: KeyExpiryProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { data: key } = useAccountKey({ enabled: isLoggedIn });
    if (!isLoggedIn || !key?.expiresAt) return null;
    return (
        <Chip
            data-polli="key-expiry"
            className={cn("polli:tabular-nums", className)}
        >
            {key.expiresAt.slice(0, 10)}
        </Chip>
    );
}
