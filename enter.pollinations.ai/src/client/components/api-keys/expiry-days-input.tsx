import { Field } from "@ark-ui/react";
import type { FC } from "react";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";

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
    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            {!compact && (
                <Field.Label
                    className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0" : "mb-2"}`}
                >
                    Expiry
                    <InfoTip
                        text="Key expires after this many days. Leave empty for no expiry."
                        label="Expiry information"
                    />
                </Field.Label>
            )}
            <div className="flex items-center gap-2">
                <Input
                    id="expiry-days-input"
                    name="expiry-days"
                    type="number"
                    min={0}
                    step="any"
                    value={value ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val === "" ? null : Number(val));
                    }}
                    className={`w-32 ${compact ? "text-sm" : ""}`}
                    placeholder="Never"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500">days</span>
            </div>
        </Field.Root>
    );
};
