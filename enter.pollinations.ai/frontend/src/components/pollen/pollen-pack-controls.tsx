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
                    className={cn(
                        "flex cursor-pointer flex-col items-center rounded-xl border px-2 pt-3 pb-2.5 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paid-soft",
                        selected
                            ? "border-paid-soft bg-paid-pale text-paid-deep ring-2 ring-paid-soft"
                            : "border-paid-soft bg-transparent text-paid-deep hover:bg-paid-pale/50",
                    )}
                >
                    <span className="text-2xl font-bold leading-none tracking-tight">
                        {pollen}
                    </span>
                    <span className="mt-1 text-xs">pollen</span>
                    <span className="mt-2 text-sm font-semibold">{price}</span>
                </button>
            );
        })}
    </div>
);
