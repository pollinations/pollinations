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
    framed = false,
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

    return (
        <section
            id={id}
            className={cn(
                "polli:flex polli:scroll-mt-10 polli:flex-col polli:gap-4",
                className,
            )}
        >
            <header className="polli:flex polli:flex-wrap polli:items-center polli:justify-between polli:gap-3 polli:px-1">
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
            {framed ? (
                <Surface
                    variant="panel"
                    className={cn(
                        "polli:flex polli:flex-col polli:gap-5",
                        panelClassName,
                    )}
                >
                    {body}
                </Surface>
            ) : (
                body
            )}
        </section>
    );
};
