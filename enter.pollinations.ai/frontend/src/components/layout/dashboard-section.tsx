import { cn } from "@frontend/lib/cn.ts";
import { Surface } from "@pollinations_ai/ui";
import type { FC, ReactNode } from "react";
import type { ThemeName } from "./dashboard-theme.ts";

type DashboardSectionProps = {
    title: string;
    theme: ThemeName;
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
                data-theme={theme}
                className="text-left text-lg font-semibold sm:text-xl text-theme-text-strong"
            >
                {title}
            </h2>
            {action && (
                <div className={cn("shrink-0", actionClassName)}>{action}</div>
            )}
        </div>
        {framed ? (
            <Surface variant="panel" theme={theme}>
                {children}
            </Surface>
        ) : (
            children
        )}
    </section>
);
