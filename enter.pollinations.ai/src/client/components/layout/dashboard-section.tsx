import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { Panel } from "../ui/panel.tsx";
import {
    type DashboardTheme,
    type ThemeName,
    themes,
} from "./dashboard-theme.ts";

// `gray` is in DashboardTheme but not ThemeName; for the cascade it falls back
// to the default `:root` (green). Drop it before passing to Surface/Panel.
const asThemeName = (theme: DashboardTheme): ThemeName | undefined =>
    themes.includes(theme as ThemeName) ? (theme as ThemeName) : undefined;

type DashboardSectionProps = {
    title: string;
    theme: DashboardTheme;
    id?: string;
    framed?: boolean;
    action?: ReactNode;
    actionClassName?: string;
    children: ReactNode;
    className?: string;
};

export const DashboardSection: FC<DashboardSectionProps> = ({
    title,
    theme,
    id,
    framed = false,
    action,
    actionClassName,
    children,
    className,
}) => (
    <section id={id} className={cn("scroll-mt-10 space-y-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <h2
                data-theme={asThemeName(theme)}
                className="text-left text-lg font-semibold sm:text-xl text-theme-text-strong"
            >
                {title}
            </h2>
            {action && (
                <div className={cn("shrink-0", actionClassName)}>{action}</div>
            )}
        </div>
        {framed ? (
            <Panel theme={asThemeName(theme)}>{children}</Panel>
        ) : (
            children
        )}
    </section>
);
