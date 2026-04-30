import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { type DashboardTheme, tabColors } from "../layout/dashboard-theme.ts";

type TabButtonProps = {
    theme: DashboardTheme;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
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
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        disabled={disabled}
        className={cn(
            "inline-flex min-h-8 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
            active ? tabColors[theme].active : tabColors[theme].inactive,
            disabled && "cursor-not-allowed opacity-50",
            className,
        )}
    >
        {children}
    </button>
);
