import { Field } from "@ark-ui/react";
import type { FC } from "react";
import { cn } from "@/util.ts";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";
import {
    getPermissionUiTheme,
    type PermissionUiTheme,
} from "./permission-ui.ts";

type PollenBudgetInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    hideLabel?: boolean;
    inline?: boolean;
    theme?: PermissionUiTheme;
};

/**
 * Reusable pollen budget input component.
 * - null = unlimited budget
 * - number = spending cap in pollen (supports decimals)
 */
export const PollenBudgetInput: FC<PollenBudgetInputProps> = ({
    value,
    onChange,
    disabled = false,
    hideLabel = false,
    inline = false,
    theme = "green",
}) => {
    const {
        input: { classes: inputClasses },
        accent: { tipTone },
    } = getPermissionUiTheme(theme);

    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            {!hideLabel && (
                <Field.Label
                    className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0" : "mb-2"}`}
                >
                    Budget
                    <InfoTip
                        text="Set a spending limit for this key. Leave empty for unlimited."
                        label="Budget information"
                        tone={tipTone}
                    />
                </Field.Label>
            )}
            <div className="flex items-center gap-2">
                <Input
                    id="pollen-budget-input"
                    name="pollen-budget"
                    type="number"
                    min={0}
                    step={0.01}
                    value={value ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val === "" ? null : Number(val));
                    }}
                    className={cn("input-number-clean w-24", inputClasses)}
                    placeholder="Unlimited"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">pollen</span>
            </div>
        </Field.Root>
    );
};
