import { cn } from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatPollenPackValue,
    formatUsdCentsCompact,
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
    describe = (pollen, price) => `Select ${pollen} Pollen for ${price}`,
}) => (
    <div
        className={cn(
            "grid grid-cols-3 gap-2",
            packs.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-6",
        )}
    >
        {packs.map((pack) => {
            const pollen = formatPollenPackValue(pack.amountUsd);
            const price = formatUsdCentsCompact(
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
                    // both modes); chosen it takes the accent fill and hover
                    // turns amber, as tabs do. The ring shows keyboard focus
                    // only.
                    className={cn(
                        "flex cursor-pointer flex-col items-center rounded-xl px-2 pt-3 pb-2.5 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-text-soft",
                        selected
                            ? "bg-theme-bg-active text-theme-text-strong hover:bg-theme-bg-hover"
                            : "bg-theme-text-strong/[0.06] text-theme-text-base hover:bg-theme-bg-hover hover:text-theme-text-hover",
                    )}
                >
                    <span className="text-2xl font-bold leading-none tracking-tight">
                        {pollen}
                    </span>
                    {/* Faded, not grey: readable on both fills. */}
                    <span className="mt-1 text-xs opacity-70">pollen</span>
                    <span className="mt-2 text-sm font-semibold">{price}</span>
                </button>
            );
        })}
    </div>
);
