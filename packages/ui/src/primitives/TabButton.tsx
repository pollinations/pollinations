import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type TabButtonProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "md" | "sm";
    variant?: "default" | "ghost" | "soft";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

/** Shared pill shape (no colors) — reused by ModalityTab so both match exactly. */
export const tabButtonBaseClass =
    "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:font-medium polli:leading-normal polli:transition-all polli:duration-200";

export const tabButtonSizeClass = {
    md: "polli:px-4 polli:py-1.5 polli:text-base",
    sm: "polli:px-3 polli:py-1.5 polli:text-sm",
} as const;

const variantClasses = {
    default: {
        base: "polli:border",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong polli:border-theme-border",
        inactive:
            "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:border-theme-border polli:hover:bg-theme-bg-active",
    },
    ghost: {
        base: "polli:border polli:border-transparent",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong",
        inactive:
            "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-theme-bg-subtle polli:hover:text-theme-text-strong",
    },
    // Filled like `default`, but borderless. Without a border the faint
    // `bg-subtle` is invisible on the themed panel, so this shifts up to opaque
    // fills: a visible accent when idle, a stronger fill when selected, plus a
    // hover step.
    soft: {
        base: "",
        active: "polli:bg-theme-bg-hover polli:text-theme-text-strong",
        inactive:
            "polli:bg-theme-bg-active polli:text-theme-text-base polli:hover:bg-theme-bg-hover",
    },
} as const;

export const TabButton: FC<TabButtonProps> = ({
    active,
    onClick,
    children,
    size = "md",
    variant = "default",
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
