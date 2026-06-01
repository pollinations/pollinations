import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

export type StatCardProps = {
    label: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
    theme?: ThemeName;
    className?: string;
    labelClassName?: string;
    valueClassName?: string;
    detailClassName?: string;
};

export const StatCard: FC<StatCardProps> = ({
    label,
    value,
    detail,
    theme,
    className,
    labelClassName,
    valueClassName,
    detailClassName,
}) => (
    <div data-theme={theme} className={cn("polli:text-sm", className)}>
        <div
            className={cn(
                "polli:text-micro polli:font-bold polli:uppercase polli:tracking-wide polli:text-theme-text-strong",
                labelClassName,
            )}
        >
            {label}
        </div>
        <div
            className={cn(
                "polli:mt-1 polli:min-h-8 polli:break-words polli:text-2xl polli:font-bold polli:leading-tight polli:tabular-nums polli:text-theme-text-strong",
                valueClassName,
            )}
        >
            {value}
        </div>
        {detail && (
            <div
                className={cn(
                    "polli:mt-2 polli:text-xs polli:text-theme-text-soft",
                    detailClassName,
                )}
            >
                {detail}
            </div>
        )}
    </div>
);
