import { ButtonGroup, Field, InfoTip } from "@pollinations/ui";
import type { FC } from "react";

type PollenTypeInputProps = {
    value: "quest" | "paid" | null;
    onChange: (value: "quest" | "paid" | null) => void;
    disabled?: boolean;
    inline?: boolean;
};

/**
 * Pollen type restriction input.
 * - null = use either quest or paid pollen (default)
 * - "quest" = only use quest pollen (tier_balance)
 * - "paid" = only use paid pollen (pack_balance)
 */
export const PollenTypeInput: FC<PollenTypeInputProps> = ({
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
                Pollen type
                <InfoTip
                    text="Restrict this key to only use quest pollen or paid pollen. Leave as Any to use both."
                    label="Pollen type information"
                />
            </Field.Label>
            <ButtonGroup aria-label="Pollen type restriction">
                <ButtonGroup.Item
                    pressed={value === null}
                    onClick={() => onChange(null)}
                    disabled={disabled}
                >
                    Any
                </ButtonGroup.Item>
                <ButtonGroup.Item
                    pressed={value === "quest"}
                    onClick={() => onChange("quest")}
                    disabled={disabled}
                >
                    Quest only
                </ButtonGroup.Item>
                <ButtonGroup.Item
                    pressed={value === "paid"}
                    onClick={() => onChange("paid")}
                    disabled={disabled}
                >
                    Paid only
                </ButtonGroup.Item>
            </ButtonGroup>
        </Field.Root>
    );
};
