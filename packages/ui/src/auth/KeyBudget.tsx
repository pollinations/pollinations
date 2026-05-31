import { useAccountKey, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { Chip } from "../primitives/Chip.tsx";
import { formatPollen } from "../wallet/format-pollen.ts";

export type KeyBudgetProps = { className?: string };

/** Renders the current delegated key's remaining budget. `null` until loaded. */
export function KeyBudget({ className }: KeyBudgetProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { data: key } = useAccountKey({ enabled: isLoggedIn });
    const budget = key?.pollenBudget;
    if (!isLoggedIn || budget == null) return null;
    return (
        <Chip
            data-polli="key-budget"
            className={cn("polli:tabular-nums", className)}
        >
            {formatPollen(budget)} pollen
        </Chip>
    );
}
