import { CardIcon, ClockIcon, Input, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { useEffect, useId, useState } from "react";

export const DEFAULT_KEY_LIMITS = { pollenBudget: 5, expiryDays: 7 };

const limits = {
    budget: {
        label: "Budget",
        icon: <CardIcon />,
        name: "pollen-budget",
        unit: "pollen",
        min: 0,
        step: 0.01,
        helper: "Spending cap for this key. Leave empty for no cap.",
    },
    expiry: {
        label: "Expiry",
        icon: <ClockIcon />,
        name: "expiry-days",
        unit: "days",
        min: 1 / 86400,
        step: "any",
        helper: "Time until this key expires. Leave empty to never expire.",
    },
} as const;

/** A limit is always shown; an empty field means unlimited (null). */
export function KeyLimitInput({
    kind,
    value,
    onChange,
    disabled = false,
}: {
    kind: keyof typeof limits;
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
}) {
    const inputId = useId();
    const limit = limits[kind];
    const [draft, setDraft] = useState(value === null ? "" : String(value));

    useEffect(() => {
        if (value !== null) setDraft(String(value));
    }, [value]);

    return (
        <AuthAccessItem
            icon={limit.icon}
            details={
                <div className="space-y-2">
                    <label
                        htmlFor={inputId}
                        className="flex items-center gap-2"
                    >
                        <span className="sr-only">{limit.label} value</span>
                        <Input
                            id={inputId}
                            name={limit.name}
                            type="number"
                            min={limit.min}
                            step={limit.step}
                            value={draft}
                            disabled={disabled}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                const next = Number(event.target.value);
                                onChange(
                                    event.target.value !== "" &&
                                        Number.isFinite(next)
                                        ? next
                                        : null,
                                );
                            }}
                            className="w-[116px]"
                            hideNumberSteppers
                        />
                        <Text as="span" size="sm" tone="muted">
                            {limit.unit}
                        </Text>
                    </label>
                    <Text size="xs" tone="muted">
                        {limit.helper}
                    </Text>
                </div>
            }
        >
            {limit.label}
        </AuthAccessItem>
    );
}
