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
    inline = false,
}: {
    kind: keyof typeof limits;
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    accessContext?: "app" | "device";
    /** Compact one-line rendering for grouping several limits on a row. */
    inline?: boolean;
}) {
    const inputId = useId();
    const limit = limits[kind];
    const [draft, setDraft] = useState(value === null ? "" : String(value));
    // A spent key may already be below zero. Preserve that balance on edit,
    // while new budgets and further reductions still have a lower bound.
    const [min] = useState(() =>
        kind === "budget" ? Math.min(0, value ?? 0) : limit.min,
    );

    useEffect(() => {
        setDraft(value === null ? "" : String(value));
    }, [value]);

    const input = (
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
                    event.target.value !== "" && Number.isFinite(next)
                        ? next
                        : null,
                );
            }}
            className={inline ? "w-20" : "w-[116px]"}
            hideNumberSteppers
        />
    );
    const info = (
        <InfoTip
            text={
                accessContext ? limit.accessHelper(accessContext) : limit.helper
            }
            label={`${limit.label} information`}
        />
    );

    if (inline) {
        // One control group: icon + label + input + unit stay together when
        // the surrounding row wraps; full-width on phones for easy tapping.
        return (
            <span className="flex w-full shrink-0 items-center gap-2 whitespace-nowrap sm:w-auto">
                <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-theme-text-strong [&>svg]:h-4 [&>svg]:w-4"
                >
                    {limit.icon}
                </span>
                <span className="inline-flex items-center">
                    <label htmlFor={inputId}>{limit.label}</label>
                    {info}
                </span>
                {input}
                <Text as="span" size="xs" tone="muted">
                    {limit.unit}
                </Text>
            </span>
        );
    }

    return (
        <AuthAccessItem
            icon={limit.icon}
            control={
                <label htmlFor={inputId} className="flex items-center gap-2">
                    <span className="sr-only">{limit.label} value</span>
                    {input}
                    <Text as="span" size="xs" tone="muted" className="w-12">
                        {limit.unit}
                    </Text>
                </label>
            }
        >
            <span className="inline-flex items-center">
                {limit.label}
                {info}
            </span>
        </AuthAccessItem>
    );
}
