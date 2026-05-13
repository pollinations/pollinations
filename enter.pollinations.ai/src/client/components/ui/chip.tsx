import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../../../util.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";

/**
 * Four semantic chip labels — each maps to a dashboard concept:
 *  - news  : newly-added model (green)
 *  - alpha : experimental model (warning yellow)
 *  - paid  : paid pollen / paid-only model (orange, matches wallet)
 *  - tier  : tier pollen (yellow, matches wallet)
 */
type ChipIntent = "news" | "alpha" | "paid" | "tier";

const chipSizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
    lg: "px-3 py-1 text-sm",
} as const;

const intentClasses: Record<ChipIntent, string> = {
    news: "bg-intent-news-bg text-intent-news-text",
    alpha: "bg-intent-alpha-bg text-intent-alpha-text",
    paid: "bg-paid-soft text-paid-deep",
    tier: "bg-tier-soft text-tier-deep",
};

type ChipProps = ComponentPropsWithoutRef<"span"> & {
    /** Override the cascade theme for this chip's subtree. */
    theme?: ThemeName;
    /** Semantic intent — paid or alpha. Wins over `theme` when set. */
    intent?: ChipIntent;
    size?: keyof typeof chipSizes;
};

// Static, rectangular colored container. Round shapes are reserved for buttons.
// Reads `bg-theme-chip-bg` / `text-theme-chip-text` from the cascade unless
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
        : "bg-theme-chip-bg text-theme-chip-text";
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
