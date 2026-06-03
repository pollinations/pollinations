import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

export type TabButtonProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    /** Optional cascade override; defaults to inherited [data-theme]. */
    theme?: ThemeName;
    size?: "medium" | "small";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

const sizeClasses = {
    medium: "polli:px-4 polli:py-1.5 polli:text-base",
    small: "polli:px-3 polli:py-1.5 polli:text-sm",
} as const;

export const TabButton: FC<TabButtonProps> = ({
    theme,
    active,
    onClick,
    children,
    size = "medium",
    ariaLabel,
    disabled = false,
    className,
}) => {
    return (
        <button
            type="button"
            data-theme={theme}
            onClick={onClick}
            aria-label={ariaLabel}
            aria-pressed={active}
            disabled={disabled}
            className={cn(
                "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:border polli:font-medium polli:leading-normal polli:transition-all polli:duration-200",
                active
                    ? "polli:bg-theme-bg-active polli:text-theme-text-strong polli:border-theme-border"
                    : "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:border-theme-border polli:hover:bg-theme-bg-active",
                disabled && "polli:cursor-not-allowed polli:opacity-50",
                sizeClasses[size],
                className,
            )}
        >
            {children}
        </button>
    );
};
