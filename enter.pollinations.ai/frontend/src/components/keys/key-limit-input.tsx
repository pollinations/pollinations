import { CardIcon, ClockIcon, Input, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { useEffect, useId, useState } from "react";

export const DEFAULT_KEY_LIMITS = { pollenBudget: 5, expiryDays: 7 };

/**
 * Null is unlimited. As a toggle (dashboard dialogs) an enabled limit always
 * carries a number: re-enabling restores the last value (or the default) and
 * clearing the field snaps back on blur. As a required row (consent) the
 * field is always shown and an empty field means unlimited.
 */
export function KeyLimitInput({
    kind,
    value,
    onChange,
    disabled = false,
    required = false,
}: {
    kind: "budget" | "expiry";
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    required?: boolean;
}) {
    const inputId = useId();
    const isBudget = kind === "budget";
    const fallback = isBudget
        ? DEFAULT_KEY_LIMITS.pollenBudget
        : DEFAULT_KEY_LIMITS.expiryDays;
    const enabled = required || value !== null;
    const [lastValue, setLastValue] = useState(value ?? fallback);
    const [draft, setDraft] = useState(value === null ? "" : String(value));

    useEffect(() => {
        if (value !== null) {
            setLastValue(value);
            setDraft(String(value));
        }
    }, [value]);

    const label = isBudget ? "Budget" : "Expiry";
    const helper = isBudget
        ? "Spending cap for this key."
        : "Time until this key expires.";
    const emptyHelper = isBudget
        ? "Leave empty for no cap."
        : "Leave empty to never expire.";
    return (
        <AuthAccessItem
            checked={enabled}
            disabled={disabled}
            icon={
                required ? isBudget ? <CardIcon /> : <ClockIcon /> : undefined
            }
            onChange={
                required
                    ? undefined
                    : (checked) => onChange(checked ? lastValue : null)
            }
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
                                value={draft}
                                disabled={disabled}
                                onChange={(event) => {
                                    setDraft(event.target.value);
                                    const next = Number(event.target.value);
                                    if (
                                        event.target.value !== "" &&
                                        Number.isFinite(next)
                                    ) {
                                        onChange(next);
                                    } else if (required) {
                                        onChange(null);
                                    }
                                }}
                                onBlur={() => {
                                    if (draft === "" && !required)
                                        setDraft(String(lastValue));
                                }}
                                className="w-[116px]"
                                hideNumberSteppers
                            />
                            <Text as="span" size="sm" tone="muted">
                                {isBudget ? "pollen" : "days"}
                            </Text>
                        </label>
                        <Text size="xs" tone="muted">
                            {required ? `${helper} ${emptyHelper}` : helper}
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
