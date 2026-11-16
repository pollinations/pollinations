import { Field, InfoTip } from "@pollinations/ui";
import type { ReactNode } from "react";

export function ModelFormRow({
    label,
    help,
    optional = false,
    action,
    note,
    top = false,
    children,
}: {
    label: string;
    help?: ReactNode;
    optional?: boolean;
    action?: ReactNode;
    /** Shown under the control so the label stays centred on the control alone. */
    note?: ReactNode;
    /** The control is a list of fields: the label lines up with the first. */
    top?: boolean;
    children: ReactNode;
}) {
    return (
        <Field.Root
            className={`grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] ${top ? "sm:items-start" : "sm:items-center"}`}
        >
            {/* As tall as one Input, so the label centres on the first. */}
            <span
                className={`inline-flex min-w-0 items-center ${top ? "sm:min-h-[2.625rem]" : ""}`}
            >
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
            {note && <div className="min-w-0 sm:col-start-2">{note}</div>}
        </Field.Root>
    );
}
