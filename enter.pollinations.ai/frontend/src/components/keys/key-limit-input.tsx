import { CardIcon, ClockIcon, InfoTip, Input, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { useEffect, useId, useState } from "react";

const limits = {
    budget: {
        label: "Budget",
        icon: <CardIcon />,
        name: "pollen-budget",
        unit: "pollen",
        min: 0,
        step: "any",
        empty: "Unlimited",
        helper: "Spending cap for this key. Requests are rejected after the budget is spent. Leave empty for no cap.",
        accessHelper: (subject: "app" | "device") =>
            `Spending cap for this ${subject}. Requests are rejected after the budget is spent. Leave empty for no cap.`,
    },
    budgetTier: {
        label: "Quest budget",
        icon: <CardIcon />,
        name: "pollen-budget-tier",
        unit: "pollen",
        min: 0,
        step: "any",
        empty: "Unlimited",
        helper: "Quest (free) pollen cap for this key. Quest-billed requests are rejected after this is spent. Leave empty for no separate cap.",
        accessHelper: (subject: "app" | "device") =>
            `Quest (free) pollen cap for this ${subject}. Quest-billed requests are rejected after this is spent. Leave empty for no separate cap.`,
    },
    budgetPaid: {
        label: "Paid budget",
        icon: <CardIcon />,
        name: "pollen-budget-paid",
        unit: "pollen",
        min: 0,
        step: "any",
        empty: "Unlimited",
        helper: "Paid pollen cap for this key. Paid-billed requests are rejected after this is spent. Leave empty for no separate cap.",
        accessHelper: (subject: "app" | "device") =>
            `Paid pollen cap for this ${subject}. Paid-billed requests are rejected after this is spent. Leave empty for no separate cap.`,
    },
    expiry: {
        label: "Expiry",
        icon: <ClockIcon />,
        name: "expiry-days",
        unit: "days",
        min: 1 / 86400,
        step: "any",
        empty: "Never",
        helper: "Key expires after this many days. Leave empty for no expiry.",
        accessHelper: (subject: "app" | "device") =>
            `${subject === "app" ? "App" : "Device"} access expires after this many days. Leave empty for no expiry.`,
    },
} as const;

/** A limit is always shown; an empty field means unlimited (null). */
export function KeyLimitInput({
    kind,
    value,
    onChange,
    disabled = false,
    accessContext,
}: {
    kind: keyof typeof limits;
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    accessContext?: "app" | "device";
}) {
    const inputId = useId();
    const limit = limits[kind];
    const [draft, setDraft] = useState(value === null ? "" : String(value));
    // A spent key may already be below zero. Preserve that balance on edit,
    // while new budgets and further reductions still have a lower bound.
    const [min] = useState(() =>
        kind === "expiry" ? limit.min : Math.min(0, value ?? 0),
    );

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
                        min={min}
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
                    text={
                        accessContext
                            ? limit.accessHelper(accessContext)
                            : limit.helper
                    }
                    label={`${limit.label} information`}
                />
            </span>
        </AuthAccessItem>
    );
}
