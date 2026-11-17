import { cn } from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatPollenPackValue,
    formatUsdCents,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { FC } from "react";

/** Choosing a pack only selects it; the action button decides what happens. */
export const PollenPackButtons: FC<{
    packs: readonly PollenPack[];
    selectedAmount?: number;
    onSelect: (pack: PollenPack) => void;
    describe?: (pollen: string, price: string) => string;
}> = ({
    packs,
    selectedAmount,
    onSelect,
    describe = (pollen, price) => `Select ${pollen} for ${price}`,
}) => (
    <div
        className={cn(
            "grid grid-cols-3 gap-2",
            packs.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-6",
        )}
    >
        {packs.map((pack) => {
            // What the pack adds to the balance, in the balance's dollars.
            const pollen = `$${formatPollenPackValue(pack.amountUsd)}`;
            const price = formatUsdCents(
                pack.amountUsd * 100 +
                    calculateServiceFeeCents(pack.amountUsd * 100),
            );
            const selected = pack.amountUsd === selectedAmount;
            return (
                <button
                    key={pack.packKey}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(pack)}
                    aria-label={describe(pollen, price)}
                    // A value, not an action: never a border. Idle it is a
                    // quiet grey (a tint of the text colour, so it shows in
                    // both modes). Hover is a pale wash of the fill; chosen
                    // is the full fill with its dark text and stays so on
                    // hover. The ring shows keyboard focus only.
                    className={cn(
                        "flex cursor-pointer flex-col items-center rounded-xl px-2 pt-3 pb-2.5 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-text-soft",
                        selected
                            ? "bg-theme-fill text-theme-on-fill"
                            : "bg-theme-text-strong/[0.06] text-theme-text-base hover:bg-theme-fill-wash",
                    )}
                >
                    <span className="text-2xl font-bold leading-none tracking-tight">
                        {pollen}
                    </span>
                    {/* What you pay, in parentheses under what you get; the
                        footnote below the packs explains the fee. Faded, not
                        grey: readable on both fills. */}
                    <span className="mt-1.5 text-sm font-semibold opacity-70">
                        ({price})
                    </span>
                </button>
            );
        })}
    </div>
);
