import { CardIcon, ClockIcon, InfoTip, Input, Text } from "@pollinations/ui";
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
        empty: "Unlimited",
        helper: "Spending cap for this key. Leave empty for no cap.",
    },
    expiry: {
        label: "Expiry",
        icon: <ClockIcon />,
        name: "expiry-days",
        unit: "days",
        min: 1 / 86400,
        step: "any",
        empty: "Never",
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
        setDraft(value === null ? "" : String(value));
    }, [value]);

    return (
        <AuthAccessItem
            icon={limit.icon}
            control={
                <label htmlFor={inputId} className="flex items-center gap-2">
                    <span className="sr-only">{limit.label} value</span>
                    <Input
                        id={inputId}
                        name={limit.name}
                        type="number"
                        min={limit.min}
                        step={limit.step}
                        value={draft}
                        placeholder={limit.empty}
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
                    <Text as="span" size="xs" tone="muted" className="w-12">
                        {limit.unit}
                    </Text>
                </label>
            }
        >
            <span className="inline-flex items-center">
                {limit.label}
                <InfoTip
                    text={limit.helper}
                    label={`${limit.label} information`}
                />
            </span>
        </AuthAccessItem>
    );
}
