import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Surface } from "../primitives/Surface.tsx";
import { Heading, Text } from "../primitives/Typography.tsx";

export type SectionProps = {
    title: string;
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
    id,
    framed = true,
    intro,
    action,
    actionClassName,
    panelClassName,
    titleClassName,
    children,
    className,
}) => {
    const body = (
        <>
            {intro && (
                <Text as="div" className="polli:max-w-2xl">
                    {intro}
                </Text>
            )}
            {children}
        </>
    );

    const content = (
        <>
            <header className="polli:flex polli:flex-wrap polli:items-center polli:justify-between polli:gap-3">
                <Heading
                    as="h2"
                    size="section"
                    className={cn("polli:text-left", titleClassName)}
                >
                    {title}
                </Heading>
                {action && (
                    <div className={cn("polli:shrink-0", actionClassName)}>
                        {action}
                    </div>
                )}
            </header>
            {body}
        </>
    );

    return (
        <section id={id} className={cn("polli:scroll-mt-10", className)}>
            {framed ? (
                <Surface
                    variant="panel"
                    className={cn(
                        "polli:flex polli:flex-col polli:gap-5",
                        panelClassName,
                    )}
                >
                    {content}
                </Surface>
            ) : (
                <div className="polli:flex polli:flex-col polli:gap-4">
                    {content}
                </div>
            )}
        </section>
    );
};
