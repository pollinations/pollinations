import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Surface } from "../primitives/Surface.tsx";
import { Heading, Text } from "../primitives/Typography.tsx";

export type CalloutProps = {
    title: ReactNode;
    body: ReactNode;
    children: ReactNode;
    tone?: "theme" | "dark";
    className?: string;
};

/** Prominent closing panel with a title, supporting copy, and actions. */
export function Callout({
    title,
    body,
    children,
    tone = "theme",
    className,
}: CalloutProps) {
    return (
        <Surface
            as="section"
            variant="panel"
            className={cn(
                "polli:flex polli:flex-wrap polli:items-center polli:justify-between polli:gap-8 polli:rounded-3xl polli:px-6 polli:py-9 polli:sm:gap-10 polli:sm:px-10 polli:sm:py-12",
                tone === "dark" ? "dark polli:bg-brand-dark" : undefined,
                className,
            )}
        >
            <div className="polli:flex polli:max-w-lg polli:flex-col polli:gap-2.5">
                <Heading
                    size="section"
                    className="polli:text-3xl polli:sm:text-4xl"
                >
                    {title}
                </Heading>
                <Text className="polli:text-theme-text-strong/75">{body}</Text>
            </div>
            <div className="polli:flex polli:flex-wrap polli:items-center polli:gap-3">
                {children}
            </div>
        </Surface>
    );
}
