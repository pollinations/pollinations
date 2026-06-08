import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type TabButtonProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "md" | "sm";
    variant?: "default" | "ghost";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

const sizeClasses = {
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
                "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:font-medium polli:leading-normal polli:transition-all polli:duration-200",
                classes.base,
                active ? classes.active : classes.inactive,
                disabled && "polli:cursor-not-allowed polli:opacity-50",
                sizeClasses[size],
                className,
            )}
        >
            {children}
        </button>
    );
};
