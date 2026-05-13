import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../../../util.ts";
import type { IntentName, ThemeName } from "../layout/dashboard-theme.ts";

const chipSizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
    lg: "px-3 py-1 text-sm",
} as const;

// Intent → light-style chip backgrounds (chips are quiet, not strong CTAs).
const intentClasses: Record<IntentName, string> = {
    danger: "bg-intent-danger-bg-light text-intent-danger-text",
    success: "bg-intent-success-bg-light text-intent-success-text",
    paid: "bg-intent-paid text-intent-paid-deep",
    alpha: "bg-intent-alpha-bg text-intent-alpha-text",
};

type ChipProps = ComponentPropsWithoutRef<"span"> & {
    /** Override the cascade theme for this chip's subtree. */
    theme?: ThemeName;
    /** Semantic intent — wins over `theme` when set. */
    intent?: IntentName;
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
