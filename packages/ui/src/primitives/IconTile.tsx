import type { ComponentType } from "react";
import { cn } from "../lib/cn.ts";
import type { IconProps } from "./icons/types.ts";

const toneClasses = {
    neutral: "polli:bg-theme-bg-subtle polli:text-theme-text-strong",
    // The wallet's Paid and Quest Pollen colours, for rows about money.
    paid: "polli-wallet-chip-paid",
    tier: "polli-wallet-chip-tier",
} as const;

export type IconTileProps = {
    icon: ComponentType<IconProps>;
    tone?: keyof typeof toneClasses;
};

/** A 44px rounded square holding one icon, leading a feature or info row. */
export function IconTile({ icon: Icon, tone = "neutral" }: IconTileProps) {
    return (
        <span
            className={cn(
                "polli:flex polli:size-11 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-xl",
                toneClasses[tone],
            )}
        >
            <Icon aria-hidden="true" className="polli:size-6" />
        </span>
    );
}
