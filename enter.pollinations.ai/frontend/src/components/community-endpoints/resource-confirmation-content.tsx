import { Surface } from "@pollinations/ui";
import type { ReactNode } from "react";

export function ResourceConfirmationContent({
    resource,
    children,
}: {
    resource: ReactNode;
    children: ReactNode;
}) {
    return (
        <>
            <Surface className="p-3">
                <span className="block break-all font-mono text-sm text-theme-text-strong">
                    {resource}
                </span>
            </Surface>
            <p className="text-sm leading-relaxed text-theme-text-base">
                {children}
            </p>
        </>
    );
}
