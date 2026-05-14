import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../../../util.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";

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
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
    lg: "px-3 py-1 text-sm",
} as const;

const intentClasses: Record<ChipIntent, string> = {
    news: "bg-[oklch(0.935_0.06_158)] text-[oklch(0.46_0.13_158)]",
    alpha: "bg-[oklch(0.93_0.06_300)] text-[oklch(0.42_0.18_300)]",
    paid: "bg-paid-pale text-paid-deep",
    tier: "bg-tier-pale text-tier-deep",
    neutral: "border border-gray-400/70 bg-gray-100/80 text-gray-900",
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
        : "bg-theme-bg-active text-theme-text-strong";
    return (
        <span
            {...rest}
            data-theme={theme}
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-lg font-medium leading-normal",
                chipSizes[size],
                intentClass,
                className,
            )}
        >
            {children}
        </span>
    );
};
