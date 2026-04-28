import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { Panel } from "../ui/panel.tsx";
import {
    type DashboardTheme,
    dashboardThemeClasses,
} from "./dashboard-theme.ts";

type DashboardSectionProps = {
    title: string;
    theme: DashboardTheme;
    id?: string;
    framed?: boolean;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
};

export const DashboardSection: FC<DashboardSectionProps> = ({
    title,
    theme,
    id,
    framed = false,
    action,
    children,
    className,
}) => (
    <section id={id} className={cn("scroll-mt-10 space-y-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <h2
                className={cn(
                    "text-left text-lg font-semibold sm:text-xl",
                    dashboardThemeClasses[theme].title,
                )}
            >
                {title}
            </h2>
            {action && <div className="shrink-0">{action}</div>}
        </div>
        {framed ? <Panel color={theme}>{children}</Panel> : children}
    </section>
);
