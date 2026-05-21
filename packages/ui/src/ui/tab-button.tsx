import type { FC, ReactNode } from "react";
import type { ThemeName } from "../layout/dashboard-theme.ts";
import { cn } from "../lib/cn.ts";

type TabButtonProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    /** Optional cascade override; defaults to inherited [data-theme]. */
    theme?: ThemeName;
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

export const TabButton: FC<TabButtonProps> = ({
    theme,
    active,
    onClick,
    children,
    ariaLabel,
    disabled = false,
    className,
}) => (
    <button
        type="button"
        data-theme={theme}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        disabled={disabled}
        className={cn(
            "polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:border polli:px-4 polli:pt-1.5 polli:pb-2 polli:text-base polli:font-medium polli:leading-normal polli:transition-all polli:duration-200",
            active
                ? "polli:bg-theme-bg-active polli:text-theme-text-strong polli:border-theme-border"
                : "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:border-theme-border polli:hover:bg-theme-bg-active",
            disabled && "polli:cursor-not-allowed polli:opacity-50",
            className,
        )}
    >
        {children}
    </button>
);
