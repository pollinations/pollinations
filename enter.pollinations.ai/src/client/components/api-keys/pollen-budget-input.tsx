import { Field } from "@ark-ui/react";
import type { FC } from "react";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";

type PollenBudgetInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    compact?: boolean;
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
    compact = false,
    inline = false,
}) => {
    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            {!compact && (
                <Field.Label
                    className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0" : "mb-2"}`}
                >
                    Budget
                    <InfoTip
                        text="Set a spending limit for this key. Leave empty for unlimited."
                        label="Budget information"
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
                    className={`w-32 rounded-lg ${compact ? "text-sm" : ""}`}
                    placeholder="Unlimited"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">pollen</span>
            </div>
        </Field.Root>
    );
};
