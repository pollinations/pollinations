import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Field } from "../primitives/Field.tsx";

export type FieldStackProps = {
    label: ReactNode;
    children: ReactNode;
    className?: string;
    labelClassName?: string;
};

export function FieldStack({
    label,
    children,
    className,
    labelClassName,
}: FieldStackProps) {
    return (
        <Field.Root
            className={cn("polli:flex polli:flex-col polli:gap-2", className)}
        >
            <Field.Label
                className={cn(
                    "polli:text-sm polli:font-semibold polli:text-theme-text-strong",
                    labelClassName,
                )}
            >
                {label}
            </Field.Label>
            {children}
        </Field.Root>
    );
}
