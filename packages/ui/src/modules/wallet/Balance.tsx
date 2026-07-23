import { useAccountBalance, useAuthState } from "@pollinations/sdk/react";
import { cn } from "../../lib/cn.ts";
import { Chip } from "../../primitives/Chip.tsx";
import { formatPollen } from "./format-pollen.ts";

export type BalanceProps = { className?: string };

export function balanceLabel(balance: {
    balance: number;
    scope: "key_budget" | "account";
}): string {
    const scope = balance.scope === "key_budget" ? "app allowance" : "wallet";
    return `${formatPollen(balance.balance)} pollen · ${scope}`;
}

/** Renders the logged-in user's pollen balance. `null` until loaded. */
export function Balance({ className }: BalanceProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { data: balance } = useAccountBalance({ enabled: isLoggedIn });
    if (!isLoggedIn || balance == null) return null;
    return (
        <Chip
            data-polli="balance"
            className={cn("polli:tabular-nums", className)}
        >
            {balanceLabel(balance)}
        </Chip>
    );
}
