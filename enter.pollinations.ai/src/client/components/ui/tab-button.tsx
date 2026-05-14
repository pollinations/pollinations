import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";

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
            "inline-flex items-center justify-center rounded-full border px-4 pt-1.5 pb-2 text-base font-medium leading-normal transition-all duration-200",
            active
                ? "bg-theme-bg-active text-theme-text-strong border-theme-border"
                : "bg-theme-bg-subtle text-theme-text-base border-theme-border hover:bg-theme-bg-active",
            disabled && "cursor-not-allowed opacity-50",
            className,
        )}
    >
        {children}
    </button>
);
