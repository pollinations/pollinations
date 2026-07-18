import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Field } from "../primitives/Field.tsx";

export type FieldStackProps = {
    label: ReactNode;
    children: ReactNode;
    helper?: ReactNode;
    action?: ReactNode;
    error?: ReactNode;
    alignLabelRow?: boolean;
    className?: string;
    labelClassName?: string;
    helperClassName?: string;
    errorClassName?: string;
};

export function FieldStack({
    label,
    children,
    helper,
    action,
    error,
    alignLabelRow = false,
    className,
    labelClassName,
    helperClassName,
    errorClassName,
}: FieldStackProps) {
    return (
        <Field.Root
            className={cn("polli:flex polli:flex-col polli:gap-2", className)}
            invalid={Boolean(error)}
        >
            <div
                className={cn(
                    "polli:flex polli:items-center polli:justify-between polli:gap-2",
                    alignLabelRow && "polli:min-h-8",
                )}
            >
                <Field.Label
                    className={cn(
                        "polli:text-sm polli:font-semibold polli:text-theme-text-strong",
                        labelClassName,
                    )}
                >
                    {label}
                </Field.Label>
                {action}
            </div>
            {children}
            {error ? (
                <Field.ErrorText
                    className={cn(
                        "polli:text-xs polli:font-medium polli:leading-5 polli:text-intent-danger-text",
                        errorClassName,
                    )}
                >
                    {error}
                </Field.ErrorText>
            ) : helper ? (
                <Field.HelperText
                    className={cn(
                        "polli:text-xs polli:leading-5 polli:text-theme-text-muted",
                        helperClassName,
                    )}
                >
                    {helper}
                </Field.HelperText>
            ) : null}
        </Field.Root>
    );
}
