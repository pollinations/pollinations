import { Field, InfoTip, Input } from "@pollinations/ui";
import type { FC } from "react";

type PollenBudgetInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    inline?: boolean;
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
    inline = false,
}) => {
    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            <Field.Label
                className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0 w-20" : "mb-2"}`}
            >
                Budget
                <InfoTip
                    text="Spending cap for this key. Leave empty for unlimited. Requests are rejected after the budget is spent."
                    label="Budget information"
                />
            </Field.Label>
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
                    className="w-[116px]"
                    hideNumberSteppers
                    placeholder="Unlimited"
                    disabled={disabled}
                />
                <span className="text-sm text-theme-text-muted w-12">
                    pollen
                </span>
            </div>
        </Field.Root>
    );
};
