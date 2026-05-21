import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { formatPollen } from "../lib/format-pollen.ts";
import { Chip } from "../ui/chip.tsx";

export type BalanceProps = {
    className?: string;
};

/**
 * Renders the logged-in user's pollen balance as a single total.
 *
 * The public `/account/balance` endpoint returns one number — the tier/paid
 * split is enter.pollinations.ai's internal concern, not exposed to SDK
 * consumers. Returns `null` when logged out or before the balance has loaded.
 */
export function Balance({ className }: BalanceProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { balance } = useAuthProfile();
    if (!isLoggedIn || balance == null) return null;
    return (
        <Chip
            size="lg"
            className={cn("polli:font-pixel polli:tabular-nums", className)}
        >
            {formatPollen(balance.balance)} pollen
        </Chip>
    );
}
