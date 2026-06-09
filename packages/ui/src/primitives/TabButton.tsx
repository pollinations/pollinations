import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type TabButtonProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "md" | "sm";
    variant?: "soft" | "ghost";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

/** Shared pill shape (no colors) — used by every TabButton variant. */
export const tabButtonBaseClass =
    "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:font-medium polli:leading-normal polli:transition-all polli:duration-200";

export const tabButtonSizeClass = {
    md: "polli:px-4 polli:py-1.5 polli:text-base",
    sm: "polli:px-3 polli:py-1.5 polli:text-sm",
} as const;

const variantClasses = {
    // The default tab look: borderless and monochrome. Selected uses `bg-active`
    // — the same resting fill as the site's normal buttons; clicking the selected
    // tab does nothing, so it has no hover state. Non-selected uses the quiet
    // `bg-subtle` token and, like any button, darkens to `bg-hover` on hover —
    // distinct from the selected pill.
    soft: {
        base: "",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong",
        inactive:
            "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:hover:bg-theme-bg-hover",
    },
    // Transparent until hovered or selected — for multi-select toggles and
    // inline rows where a filled idle pill would read as a hard selection.
    ghost: {
        base: "polli:border polli:border-transparent",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong",
        inactive:
            "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-theme-bg-subtle polli:hover:text-theme-text-strong",
    },
} as const;

export const TabButton: FC<TabButtonProps> = ({
    active,
    onClick,
    children,
    size = "md",
    variant = "soft",
    ariaLabel,
    disabled = false,
    className,
}) => {
    const classes = variantClasses[variant];
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            aria-pressed={active}
            disabled={disabled}
            className={cn(
                tabButtonBaseClass,
                classes.base,
                active ? classes.active : classes.inactive,
                disabled && "polli:cursor-not-allowed polli:opacity-50",
                tabButtonSizeClass[size],
                className,
            )}
        >
            {children}
        </button>
    );
};
