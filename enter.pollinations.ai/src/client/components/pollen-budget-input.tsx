import { Field } from "@ark-ui/react";
import { type FC, useState } from "react";

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
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <Field.Root>
            {!compact && (
                <Field.Label className="flex items-center gap-1.5 text-sm font-semibold mb-2">
                    Budget
                    <button
                        type="button"
                        className="relative inline-flex items-center"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowTooltip((prev) => !prev);
                        }}
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        aria-label="Budget information"
                    >
                        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                            i
                        </span>
                        <span
                            className={`${showTooltip ? "visible" : "invisible"} absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs font-normal rounded-lg shadow-lg border border-pink-200 w-max max-w-[200px] sm:max-w-none z-50 pointer-events-none`}
                        >
                            Set a spending limit for this key. Leave empty for
                            unlimited.
                        </span>
                    </button>
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
                    className={`w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        compact ? "text-sm" : ""
                    }`}
                    placeholder="Unlimited"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">pollen</span>
            </div>
        </Field.Root>
    );
};
