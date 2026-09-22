import { AppIcon, InfoTip, Input, KeyIcon } from "@pollinations/ui";
import { useId } from "react";

/** The key's name, shown in its own full-width card. */
export function KeyNameField({
    app,
    appAccess = false,
    publishable,
    value,
    onChange,
    disabled,
}: {
    app: boolean;
    appAccess?: boolean;
    publishable: boolean;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
}) {
    const inputId = useId();
    const label = "Name";
    return (
        <li className="flex min-h-8 items-center gap-3 font-body text-sm font-semibold leading-5">
            <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center text-theme-text-strong [&>svg]:h-4 [&>svg]:w-4"
            >
                {app ? <AppIcon /> : <KeyIcon />}
            </span>
            <span className="inline-flex shrink-0 items-center">
                <label htmlFor={inputId}>{label}</label>
                <InfoTip
                    text={
                        app
                            ? "Shown to users when they connect to your app."
                            : "Shown in your activity and CSV exports."
                    }
                    label={`${label} information`}
                />
            </span>
            <Input
                id={inputId}
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={
                    app
                        ? "App name"
                        : publishable || appAccess
                          ? "Name"
                          : "Secret name"
                }
                className="min-w-0 flex-1"
                required
                disabled={disabled}
            />
        </li>
    );
}
