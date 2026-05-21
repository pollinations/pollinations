import type { ComponentPropsWithoutRef, FC } from "react";
import type { ThemeName } from "../layout/dashboard-theme.ts";
import { cn } from "../lib/cn.ts";

/**
 * Five semantic chip labels — each maps to a dashboard concept:
 *  - news    : newly-added model (green)
 *  - alpha   : experimental model (warning yellow)
 *  - paid    : paid pollen / paid-only model (orange, matches wallet)
 *  - tier    : tier pollen (yellow, matches wallet)
 *  - neutral : bordered gray container for emoji icons
 *              (modalities + capabilities on the pricing rows).
 */
type ChipIntent = "news" | "alpha" | "paid" | "tier" | "neutral";

const chipSizes = {
    sm: "polli:px-2 polli:py-0.5 polli:text-xs",
    md: "polli:px-2.5 polli:py-0.5 polli:text-sm",
    lg: "polli:px-3 polli:py-1 polli:text-sm",
} as const;

const intentClasses: Record<ChipIntent, string> = {
    news: "polli:bg-[oklch(0.935_0.06_158)] polli:text-[oklch(0.46_0.13_158)]",
    alpha: "polli:bg-[oklch(0.93_0.06_300)] polli:text-[oklch(0.42_0.18_300)]",
    paid: "polli:bg-paid-pale polli:text-paid-deep",
    tier: "polli:bg-tier-pale polli:text-tier-deep",
    neutral:
        "polli:border polli:border-gray-400/70 polli:bg-gray-100/80 polli:text-gray-900",
};

type ChipProps = ComponentPropsWithoutRef<"span"> & {
    /** Override the cascade theme for this chip's subtree. */
    theme?: ThemeName;
    /** Semantic intent — paid or alpha. Wins over `theme` when set. */
    intent?: ChipIntent;
    size?: keyof typeof chipSizes;
};

// Static, rectangular colored container. Round shapes are reserved for buttons.
// Reads `bg-theme-bg-active` / `text-theme-text-strong` from the cascade unless
// `intent` is set (semantic, theme-independent).
export const Chip: FC<ChipProps> = ({
    theme,
    intent,
    size = "md",
    className,
    children,
    ...rest
}) => {
    const intentClass = intent
        ? intentClasses[intent]
        : "polli:bg-theme-bg-active polli:text-theme-text-strong";
    return (
        <span
            {...rest}
            data-theme={theme}
            className={cn(
                "polli:inline-flex polli:shrink-0 polli:items-center polli:gap-1 polli:rounded-lg polli:font-medium polli:leading-normal",
                chipSizes[size],
                intentClass,
                className,
            )}
        >
            {children}
        </span>
    );
};
