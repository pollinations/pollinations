import { Field, FieldStack, Input } from "@pollinations/ui";

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
    return (
        <FieldStack
            label={app ? "App name" : "Name"}
            helper={
                app
                    ? "Shown to users when they connect to your app."
                    : "A label to help you recognize this key."
            }
        >
            <Field.Input asChild>
                <Input
                    type="text"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={app ? "App name" : "Key name"}
                    required
                    disabled={disabled}
                />
            </Field.Input>
        </FieldStack>
    );
}
