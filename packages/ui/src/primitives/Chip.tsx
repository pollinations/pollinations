import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";

/** Semantic chip labels for status and metadata badges. */
type ChipIntent =
    | "news"
    | "new"
    | "free"
    | "alpha"
    | "neutral"
    | "warning"
    | "danger";

const chipSizes = {
    sm: "polli:h-5 polli:px-2 polli:text-xs",
    md: "polli:h-6 polli:px-2.5 polli:text-sm",
    lg: "polli:h-7 polli:px-3 polli:text-sm",
} as const;

const intentClasses: Record<ChipIntent, string> = {
    news: "polli:bg-intent-news-bg-light polli:text-intent-news-text",
    new: "polli:bg-intent-new-bg-light polli:text-intent-new-text",
    free: "polli:bg-intent-free-bg-light polli:text-intent-free-text",
    alpha: "polli:bg-intent-alpha-bg-light polli:text-intent-alpha-text",
    neutral: "polli:bg-ink-100/80 polli:text-ink-900",
    warning: "polli:bg-intent-warning-bg-light polli:text-intent-warning-text",
    danger: "polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
};

export type ChipProps = ComponentPropsWithoutRef<"span"> & {
    /** Semantic intent. */
    intent?: ChipIntent;
    size?: keyof typeof chipSizes;
};

// Static, rectangular colored container. Round shapes are reserved for buttons.
// Reads `bg-theme-bg-active` / `text-theme-text-strong` from the cascade unless
// `intent` is set (semantic, theme-independent).
export const Chip: FC<ChipProps> = ({
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
            className={cn(
                "polli:inline-flex polli:shrink-0 polli:items-center polli:justify-center polli:gap-1 polli:rounded-lg polli:font-medium polli:leading-none",
                chipSizes[size],
                intentClass,
                className,
            )}
        >
            {children}
        </span>
    );
};
