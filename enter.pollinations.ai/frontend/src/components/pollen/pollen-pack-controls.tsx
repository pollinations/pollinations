import { cn } from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatPollenPackValue,
    formatUsdCentsCompact,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { FC } from "react";

/** Pack plus service fee: the price before tax, as Checkout charges it. */
export function packChargeCents(pack: PollenPack): number {
    return (
        pack.amountUsd * 100 + calculateServiceFeeCents(pack.amountUsd * 100)
    );
}

// Every tile has a 1px border so filled and outlined tiles are the same size.
const tileBase =
    "flex cursor-pointer flex-col items-center rounded-xl border px-2 pt-3 pb-2.5 tabular-nums transition-[box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0";

/**
 * House button rule: filled opens something (Buy now: the pay modal), outlined
 * saves (Auto-refill: choosing a pack is the setting). The current choice is
 * filled in, so it still stands out among the outlined tiles.
 */
const packTile = {
    buy: "border-transparent bg-paid-pale text-paid-deep hover:ring-2 hover:ring-paid-soft focus-visible:ring-paid-soft",
    choose: "border-paid-soft bg-transparent text-paid-deep hover:bg-paid-pale/50 focus-visible:ring-paid-soft",
    chosen: "border-paid-soft bg-paid-pale ring-2 ring-paid-soft",
} as const;

/** Off turns a feature off, not an amount: neutral, not Pollen yellow. */
const offTileClasses = {
    idle: "border-theme-text-soft/40 bg-transparent text-theme-text-muted hover:bg-theme-bg-subtle focus-visible:ring-theme-text-soft",
    chosen: "border-theme-text-soft/60 bg-theme-bg-subtle text-theme-text-strong ring-2 ring-theme-text-soft/60",
} as const;

/**
 * One button per pack, always in the same places. With `offTile`, an Off
 * choice takes the first slot (automatic top-up starts above that pack), so
 * switching between buying and choosing moves nothing.
 */
export const PollenPackButtons: FC<{
    onSelect: (pack: PollenPack) => void;
    selectedAmount?: number;
    isDisabled?: (pack: PollenPack) => boolean;
    offTile?: { selected: boolean; disabled?: boolean; onSelect: () => void };
    /** What choosing a pack does, for screen readers. */
    describe?: (pollen: string, price: string) => string;
}> = ({
    onSelect,
    selectedAmount,
    isDisabled,
    offTile,
    describe = (pollen, price) => `Buy ${pollen} Pollen for ${price}`,
}) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {POLLEN_PACKS.map((pack, index) => {
            if (offTile && index === 0)
                return (
                    <button
                        key="off"
                        type="button"
                        disabled={offTile.disabled}
                        aria-pressed={offTile.selected}
                        onClick={offTile.onSelect}
                        className={cn(
                            tileBase,
                            "justify-center",
                            offTile.selected
                                ? offTileClasses.chosen
                                : offTileClasses.idle,
                        )}
                    >
                        <span className="text-2xl font-bold leading-none tracking-tight">
                            Off
                        </span>
                    </button>
                );
            const pollen = formatPollenPackValue(pack.amountUsd);
            const price = formatUsdCentsCompact(packChargeCents(pack));
            return (
                <button
                    key={pack.packKey}
                    type="button"
                    disabled={isDisabled?.(pack)}
                    aria-pressed={pack.amountUsd === selectedAmount}
                    onClick={() => onSelect(pack)}
                    aria-label={describe(pollen, price)}
                    className={cn(
                        tileBase,
                        !offTile
                            ? cn(
                                  packTile.buy,
                                  pack.amountUsd === selectedAmount &&
                                      "ring-2 ring-paid-soft",
                              )
                            : pack.amountUsd === selectedAmount
                              ? packTile.chosen
                              : packTile.choose,
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
