import { Field, InfoTip, Input } from "@pollinations/ui";
import type { FC } from "react";

type ExpiryDaysInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    error?: string | null;
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
    error,
    inline = false,
}) => {
    return (
        <Field.Root
            invalid={!!error}
            className={inline ? "flex flex-wrap items-center gap-3" : ""}
        >
            <Field.Label
                className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0 w-20" : "mb-2"}`}
            >
                Expiry
                <InfoTip
                    text="Key expires after this many days. Leave empty for no expiry."
                    label="Expiry information"
                />
            </Field.Label>
            <div className="flex items-center gap-2">
                <Field.Input asChild>
                    <Input
                        name="expiry-days"
                        type="number"
                        min={1 / 86400}
                        max={365}
                        step="any"
                        value={value ?? ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            onChange(val === "" ? null : Number(val));
                        }}
                        className="w-[116px]"
                        hideNumberSteppers
                        placeholder="Never"
                        disabled={disabled}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? "expiry-days-error" : undefined
                        }
                    />
                </Field.Input>
                <span className="text-sm text-theme-text-muted w-12">days</span>
            </div>
            {error && (
                <Field.ErrorText
                    id="expiry-days-error"
                    role="alert"
                    className="basis-full text-xs text-intent-danger-text"
                >
                    {error}
                </Field.ErrorText>
            )}
        </Field.Root>
    );
};
