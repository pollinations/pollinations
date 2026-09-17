import { Input, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { useId, useState } from "react";

/** Null is unlimited; an enabled, empty field must pass native form validation. */
export function KeyLimitInput({
    kind,
    value,
    onChange,
    disabled = false,
}: {
    kind: "budget" | "expiry";
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
}) {
    const inputId = useId();
    const [enabled, setEnabled] = useState(value !== null);
    const isBudget = kind === "budget";
    const label = isBudget ? "Budget" : "Expiry";
    return (
        <AuthAccessItem
            checked={enabled}
            disabled={disabled}
            onChange={(checked) => {
                setEnabled(checked);
                if (!checked) onChange(null);
            }}
            details={
                enabled ? (
                    <div className="space-y-2">
                        <label
                            htmlFor={inputId}
                            className="flex items-center gap-2"
                        >
                            <span className="sr-only">{label} value</span>
                            <Input
                                id={inputId}
                                name={
                                    isBudget ? "pollen-budget" : "expiry-days"
                                }
                                type="number"
                                min={isBudget ? 0 : 1 / 86400}
                                step={isBudget ? 0.01 : "any"}
                                required
                                value={value ?? ""}
                                disabled={disabled}
                                onChange={(event) =>
                                    onChange(
                                        event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                    )
                                }
                                className="w-[116px]"
                                hideNumberSteppers
                            />
                            <Text as="span" size="sm" tone="muted">
                                {isBudget ? "pollen" : "days"}
                            </Text>
                        </label>
                        <Text size="xs" tone="muted">
                            {isBudget
                                ? "Spending cap for this key."
                                : "Time until this key expires."}
                        </Text>
                    </div>
                ) : (
                    <Text size="xs" tone="muted">
                        {isBudget ? "Unlimited spending." : "Never expires."}
                    </Text>
                )
            }
        >
            {label}
        </AuthAccessItem>
    );
}
