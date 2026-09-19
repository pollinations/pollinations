import { AppIcon, Input, KeyIcon, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { useId } from "react";

/** The key's name, as a row of the "what the key always has" card. */
export function KeyNameField({
    app,
    value,
    onChange,
    disabled,
}: {
    app: boolean;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
}) {
    const inputId = useId();
    const label = app ? "App name" : "Name";
    return (
        <AuthAccessItem
            icon={app ? <AppIcon /> : <KeyIcon />}
            details={
                <div className="mt-2">
                    <label htmlFor={inputId} className="block">
                        <span className="sr-only">{label}</span>
                        <Input
                            id={inputId}
                            type="text"
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder={app ? "App name" : "Key name"}
                            className="w-full max-w-sm"
                            required
                            disabled={disabled}
                        />
                    </label>
                </div>
            }
        >
            <span className="block">{label}</span>
            <Text
                as="span"
                size="xs"
                tone="muted"
                className="mt-0.5 block font-normal"
            >
                {app
                    ? "Shown to users when they connect to your app."
                    : "Shown in your activity and CSV exports."}
            </Text>
        </AuthAccessItem>
    );
}
