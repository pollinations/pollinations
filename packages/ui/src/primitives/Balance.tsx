import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { formatPollen } from "../lib/format-pollen.ts";
import { Chip } from "../ui/chip.tsx";

export type BalanceProps = {
    className?: string;
    /**
     * Chip intent. Defaults to `"paid"` (pollen is the paid currency), so the
     * badge has its own color identity instead of inheriting whatever theme
     * cascade wraps it. Override for showcase / custom theming.
     */
    intent?: "paid" | "tier" | "news" | "alpha" | "neutral";
};

/**
 * Renders the logged-in user's pollen balance as a single total.
 *
 * The public `/account/balance` endpoint returns one number — the tier/paid
 * split is enter.pollinations.ai's internal concern, not exposed to SDK
 * consumers. Returns `null` when logged out or before the balance has loaded.
 */
export function Balance({ className, intent = "paid" }: BalanceProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { balance } = useAuthProfile();
    if (!isLoggedIn || balance == null) return null;
    return (
        <Chip
            size="lg"
            intent={intent}
            className={cn("polli:font-pixel polli:tabular-nums", className)}
        >
            {formatPollen(balance.balance)} pollen
        </Chip>
    );
}
