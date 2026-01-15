import { Field } from "@ark-ui/react";
import type { FC } from "react";

type PollenBudgetInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    compact?: boolean;
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
}) => {
    return (
        <Field.Root>
            {!compact && (
                <Field.Label className="block text-sm font-medium mb-2">
                    Pollen Budget (optional)
                </Field.Label>
            )}
            <div className="flex items-center gap-2">
                <Field.Input
                    id="pollen-budget-input"
                    name="pollen-budget"
                    type="number"
                    min="0"
                    step="0.01"
                    value={value ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val === "" ? null : Number(val));
                    }}
                    className={`flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        compact ? "text-sm" : ""
                    }`}
                    placeholder="Unlimited"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">pollen</span>
            </div>
            {!compact && (
                <p className="text-xs text-gray-500 mt-1">
                    Set a spending limit for this key. Leave empty for
                    unlimited.
                </p>
            )}
        </Field.Root>
    );
};
