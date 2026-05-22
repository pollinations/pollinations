import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { formatPollen } from "../lib/format-pollen.ts";
import { Chip } from "../primitives/Chip.tsx";

export type BalanceProps = { className?: string };

/** Renders the logged-in user's pollen balance. `null` until loaded. */
export function Balance({ className }: BalanceProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { balance } = useAuthProfile();
    if (!isLoggedIn || balance == null) return null;
    return (
        <Chip
            data-polli="balance"
            className={cn("polli:tabular-nums", className)}
        >
            {formatPollen(balance.balance)} pollen
        </Chip>
    );
}
