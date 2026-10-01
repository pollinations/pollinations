import { Field, InfoTip } from "@pollinations/ui";
import type { ReactNode } from "react";

export function ModelFormRow({
    label,
    help,
    optional = false,
    action,
    children,
}: {
    label: string;
    help?: ReactNode;
    optional?: boolean;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Field.Root className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex min-w-0 items-center">
                <Field.Label className="text-sm font-semibold leading-5 text-theme-text-strong">
                    {label}
                </Field.Label>
                {help && (
                    <InfoTip content={help} label={`${label} information`} />
                )}
                {optional && (
                    <span className="ml-2 text-xs text-theme-text-muted">
                        optional
                    </span>
                )}
            </span>
            <div className="min-w-0">
                {action ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">{children}</div>
                        {action}
                    </div>
                ) : (
                    children
                )}
            </div>
        </Field.Root>
    );
}
