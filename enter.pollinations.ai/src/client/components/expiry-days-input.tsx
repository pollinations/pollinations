import type { FC } from "react";
import { Field } from "@ark-ui/react";

type ExpiryDaysInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    compact?: boolean;
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
}) => {
    return (
        <Field.Root>
            {!compact && (
                <Field.Label className="block text-sm font-medium mb-2">
                    Expiry
                </Field.Label>
            )}
            <div className="flex items-center gap-2">
                <Field.Input
                    id="expiry-days-input"
                    name="expiry-days"
                    type="number"
                    min="1"
                    step="1"
                    value={value ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val === "" ? null : Number(val));
                    }}
                    className={`flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        compact ? "text-sm" : ""
                    }`}
                    placeholder="Never"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">days</span>
            </div>
            {!compact && (
                <p className="text-xs text-gray-500 mt-1">
                    Key expires after this many days. Leave empty for no expiry.
                </p>
            )}
        </Field.Root>
    );
};
