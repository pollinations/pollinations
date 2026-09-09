import { Heading, Surface } from "@pollinations/ui";
import type { ReactNode } from "react";

export const CONTROL_SIZES = ["sm", "md", "lg"] as const;

// Short intro at the top of each page. No title — the header tabs already say
// which layer you're on; this just explains what that layer is.
export function PageIntro({ children }: { children: ReactNode }) {
    return (
        <section className="border-b border-divider pb-7">
            <p className="max-w-3xl text-base leading-7 text-theme-text-base">
                {children}
            </p>
        </section>
    );
}

export function SectionHeader({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <div className="mb-4 flex max-w-3xl flex-col gap-1">
            <Heading as="h2" size="section">
                {title}
            </Heading>
            {children ? (
                <p className="text-sm leading-6 text-theme-text-soft">
                    {children}
                </p>
            ) : null}
        </div>
    );
}

export function PrimitiveExample({
    name,
    description,
    children,
}: {
    name: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <Surface
            variant="panel"
            className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(220px,1.15fr)] md:items-center"
        >
            <div>
                <h3 className="font-bold">{name}</h3>
                <p className="mt-1 text-sm leading-6 text-theme-text-soft">
                    {description}
                </p>
            </div>
            <div className="min-w-0">{children}</div>
        </Surface>
    );
}
