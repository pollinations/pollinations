import { Field } from "@ark-ui/react";
import type { FC } from "react";
import { cn } from "@/util.ts";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";
import {
    getPermissionUiTheme,
    type PermissionUiTheme,
} from "./permission-ui.ts";

type ExpiryDaysInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    inline?: boolean;
    theme?: PermissionUiTheme;
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
    inline = false,
    theme = "green",
}) => {
    const {
        input: { classes: inputClasses },
        accent: { tipTone },
    } = getPermissionUiTheme(theme);

    return (
        <Field.Root className={inline ? "flex items-center gap-3" : ""}>
            <Field.Label
                className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0 w-20" : "mb-2"}`}
            >
                Expiry
                <InfoTip
                    text="Key expires after this many days. Leave empty for no expiry."
                    label="Expiry information"
                    tone={tipTone}
                />
            </Field.Label>
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
                    className={cn("input-number-clean w-[97px]", inputClasses)}
                    placeholder="Never"
                    disabled={disabled}
                />
                <span className="text-sm text-gray-500 w-12">days</span>
            </div>
        </Field.Root>
    );
};
