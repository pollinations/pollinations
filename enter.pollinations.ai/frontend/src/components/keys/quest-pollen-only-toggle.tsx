import { Field, InfoTip, Switch } from "@pollinations/ui";
import type { FC } from "react";

type QuestPollenOnlyToggleProps = {
    value: boolean | null;
    onChange: (value: boolean | null) => void;
    disabled?: boolean;
    inline?: boolean;
};

/**
 * Toggle for restricting quest models to never use paid pollen.
 * When enabled, quest models (paidOnly: false) can only use quest pollen
 * and will never fall back to paid pollen.
 */
export const QuestPollenOnlyToggle: FC<QuestPollenOnlyToggleProps> = ({
    value,
    onChange,
    disabled = false,
    inline = false,
}) => {
    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            <Field.Label
                className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0 w-20" : "mb-2"}`}
            >
                Quest only
                <InfoTip
                    text="When enabled, quest models (like openai, flux) never use paid pollen. They will only work if you have quest pollen available."
                    label="Quest pollen only information"
                />
            </Field.Label>
            <Switch
                checked={value ?? false}
                onChange={(checked) => onChange(checked)}
                disabled={disabled}
            />
        </Field.Root>
    );
};
