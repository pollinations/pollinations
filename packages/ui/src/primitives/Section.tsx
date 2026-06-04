import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";
import { Surface } from "./Surface.tsx";

export type SectionProps = {
    title: string;
    theme: ThemeName;
    id?: string;
    framed?: boolean;
    intro?: ReactNode;
    action?: ReactNode;
    actionClassName?: string;
    panelClassName?: string;
    titleClassName?: string;
    children: ReactNode;
    className?: string;
};

export const Section: FC<SectionProps> = ({
    title,
    theme,
    id,
    framed = false,
    intro,
    action,
    actionClassName,
    panelClassName,
    titleClassName,
    children,
    className,
}) => (
    <section
        id={id}
        className={cn(
            "polli:flex polli:scroll-mt-10 polli:flex-col polli:gap-4",
            className,
        )}
    >
        <div className="polli:flex polli:flex-wrap polli:items-center polli:justify-between polli:gap-3 polli:px-1">
            <h2
                data-theme={theme}
                className={cn(
                    "polli:text-left polli:font-subheading polli:text-2xl polli:leading-tight polli:text-theme-text-strong",
                    titleClassName,
                )}
            >
                {title}
            </h2>
            {action && (
                <div className={cn("polli:shrink-0", actionClassName)}>
                    {action}
                </div>
            )}
        </div>
        {framed ? (
            <Surface
                variant="panel"
                theme={theme}
                className={cn(
                    "polli:flex polli:flex-col polli:gap-5",
                    panelClassName,
                )}
            >
                {intro && (
                    <div className="polli:max-w-2xl polli:text-theme-text-base">
                        {intro}
                    </div>
                )}
                {children}
            </Surface>
        ) : (
            <>
                {intro && (
                    <div
                        data-theme={theme}
                        className="polli:max-w-2xl polli:text-theme-text-base"
                    >
                        {intro}
                    </div>
                )}
                {children}
            </>
        )}
    </section>
);
