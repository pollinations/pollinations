import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Field } from "../primitives/Field.tsx";

export type FieldStackProps = {
    /** Omit for a self-describing control; label the input itself. */
    label?: ReactNode;
    children: ReactNode;
    helper?: ReactNode;
    action?: ReactNode;
    error?: ReactNode;
    alignLabelRow?: boolean;
    /**
     * `inline` puts the label in a fixed column to the left of the control
     * (6.5rem, 5.5rem on phones), for dense settings panels whose rows
     * should line up.
     */
    orientation?: "stacked" | "inline";
    className?: string;
    labelClassName?: string;
    helperClassName?: string;
    errorClassName?: string;
};

const orientationClasses = {
    stacked: "polli:flex polli:flex-col polli:gap-2",
    inline: "polli:grid polli:grid-cols-[6.5rem_minmax(0,1fr)] polli:items-center polli:gap-x-4 polli:gap-y-2 polli:max-sm:grid-cols-[5.5rem_minmax(0,1fr)] polli:max-sm:gap-x-2 polli:[&>*:not(:first-child)]:col-start-2 polli:[&>*:not(:first-child)]:min-w-0",
} as const;

export function FieldStack({
    label,
    children,
    helper,
    action,
    error,
    alignLabelRow = false,
    orientation = "stacked",
    className,
    labelClassName,
    helperClassName,
    errorClassName,
}: FieldStackProps) {
    return (
        <Field.Root
            className={cn(
                orientationClasses[orientation],
                "polli:font-body",
                className,
            )}
            invalid={Boolean(error)}
        >
            {(label || action) && (
                <div
                    className={cn(
                        "polli:flex polli:items-center polli:justify-between polli:gap-2",
                        alignLabelRow && "polli:min-h-8",
                    )}
                >
                    {label && (
                        <Field.Label
                            className={cn(
                                "polli:text-sm polli:font-semibold polli:leading-5 polli:text-theme-text-strong",
                                labelClassName,
                            )}
                        >
                            {label}
                        </Field.Label>
                    )}
                    {action}
                </div>
            )}
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
                        "polli:text-xs polli:font-normal polli:leading-normal polli:text-theme-text-muted",
                        helperClassName,
                    )}
                >
                    {helper}
                </Field.HelperText>
            ) : null}
        </Field.Root>
    );
}
