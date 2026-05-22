import { useAuthKey, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { formatPollen } from "../lib/format-pollen.ts";
import { Chip } from "../primitives/Chip.tsx";

export type KeyBudgetProps = { className?: string };

/** Renders the current delegated key's remaining budget. `null` until loaded. */
export function KeyBudget({ className }: KeyBudgetProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { key } = useAuthKey();
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
