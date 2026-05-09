import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { type DashboardTheme, themeTokens } from "../layout/dashboard-theme.ts";

type StatProps = {
    label: string;
    value: ReactNode;
    theme: DashboardTheme;
};

export const Stat: FC<StatProps> = ({ label, value, theme }) => {
    const tokens = themeTokens[theme];
    return (
        <div className="flex flex-col">
            <span
                className={cn(
                    "text-[10px] uppercase tracking-wide font-bold",
                    tokens.text.label,
                )}
            >
                {label}
            </span>
            <span
                className={cn(
                    "text-lg font-bold tabular-nums",
                    tokens.text.strong,
                )}
            >
                {value}
            </span>
        </div>
    );
};
