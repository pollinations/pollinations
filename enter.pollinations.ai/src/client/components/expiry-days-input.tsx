import { Field } from "@ark-ui/react";
import { type FC, useState } from "react";

type ExpiryDaysInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    compact?: boolean;
    inline?: boolean;
};

/**
 * Reusable expiry days input component.
 * - null = no expiry (unlimited)
 * - number = days until expiry
 */
export const ExpiryDaysInput: FC<ExpiryDaysInputProps> = ({
    value,
    onChange,
    disabled = false,
    compact = false,
    inline = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            {!compact && (
                <Field.Label className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0" : "mb-2"}`}>
                    Expiry
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
                        aria-label="Expiry information"
                    >
                        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                            i
                        </span>
                        <span
                            className={`${showTooltip ? "visible" : "invisible"} absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs font-normal rounded-lg shadow-lg border border-pink-200 w-max max-w-[200px] sm:max-w-none z-50 pointer-events-none`}
                        >
                            Key expires after this many days. Leave empty for no
                            expiry.
                        </span>
                    </button>
                </Field.Label>
            )}
            <div className="flex items-center gap-2">
                <Field.Input
                    id="expiry-days-input"
                    name="expiry-days"
                    type="number"
                    min="0"
                    step="any"
                    value={value ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val === "" ? null : Number(val));
                    }}
                    className={`w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        compact ? "text-sm" : ""
                    }`}
                    placeholder="Never"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">days</span>
            </div>
        </Field.Root>
    );
};
