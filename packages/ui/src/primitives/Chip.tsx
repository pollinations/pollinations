import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

/** Semantic chip labels for status and metadata badges. */
type ChipIntent =
    | "news"
    | "alpha"
    | "neutral"
    | "success"
    | "warning"
    | "danger";

const chipSizes = {
    sm: "polli:px-2 polli:py-0.5 polli:text-xs",
    md: "polli:px-2.5 polli:py-0.5 polli:text-sm",
    lg: "polli:px-3 polli:py-1 polli:text-sm",
} as const;

const intentClasses: Record<ChipIntent, string> = {
    news: "polli:bg-intent-news-bg-light polli:text-intent-news-text",
    alpha: "polli:bg-intent-alpha-bg-light polli:text-intent-alpha-text",
    neutral:
        "polli:border polli:border-gray-400/70 polli:bg-gray-100/80 polli:text-gray-900",
    success:
        "polli:border polli:border-intent-success-border polli:bg-intent-success-bg-light polli:text-intent-success-text",
    warning:
        "polli:border polli:border-intent-warning-border polli:bg-intent-warning-bg-light polli:text-intent-warning-text",
    danger: "polli:border polli:border-intent-danger-border polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
};

export type ChipProps = ComponentPropsWithoutRef<"span"> & {
    /** Override the cascade theme for this chip's subtree. */
    theme?: ThemeName;
    /** Semantic intent. Wins over `theme` when set. */
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
