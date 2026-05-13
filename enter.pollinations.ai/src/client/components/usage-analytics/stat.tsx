import type { FC, ReactNode } from "react";
import type { ThemeName } from "../layout/dashboard-theme.ts";

type StatProps = {
    label: string;
    value: ReactNode;
    theme: ThemeName;
};

export const Stat: FC<StatProps> = ({ label, value, theme }) => (
    <div data-theme={theme} className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide font-bold text-theme-text-label">
            {label}
        </span>
        <span className="text-lg font-bold tabular-nums text-theme-text-strong">
            {value}
        </span>
    </div>
);
