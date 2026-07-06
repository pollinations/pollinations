import { Alert, Button, Input } from "@pollinations/ui";
import { useState } from "react";
import { utcDateTime } from "../lib/format";
import { type StageInput, useStaging } from "../lib/staging";

const USAGE_BUCKETS = [
    { label: "prepaid usage", value: "prepaid" },
    { label: "credit usage", value: "credit" },
];

export function buildManualMeterChange({
    amount,
    currency,
    funding,
    month,
    provider,
}: {
    amount: number;
    currency: string;
    funding: string;
    month: string;
    provider: string;
}): StageInput {
    return {
        datasource: "meter_monthly",
        key: `meter:${provider}:${month}:${funding}:${currency}`,
        row: {
            month,
            provider,
            amount,
            currency,
            funding,
            source: "manual",
        },
        summary: `usage ${provider} ${month} ${funding} -> ${amount} ${currency}`,
    };
}

export function meterOverrideKey({
    currency,
    funding,
    month,
    provider,
}: {
    currency: string;
    funding: string;
    month: string;
    provider: string;
}) {
    return `${provider}|${month}|${funding}|${currency}`;
}

export function buildMeterManualResetChange({
    enteredAt = utcDateTime(),
    currency,
    funding,
    month,
    provider,
    reset,
}: {
    enteredAt?: string;
    currency: string;
    funding: string;
    month: string;
    provider: string;
    reset: boolean;
}): StageInput {
    const key = meterOverrideKey({ currency, funding, month, provider });
    return {
        datasource: "overrides",
        key: `meter-reset:${key}`,
        row: {
            entered_at: enteredAt,
            scope: "meter_monthly",
            key,
            field: "reset_manual",
            value_num: null,
            value_str: reset ? "1" : "0",
            note: "",
        },
        summary: reset
            ? `usage ${provider} ${month} ${funding} ${currency} reset manual value`
            : `usage ${provider} ${month} ${funding} ${currency} keep manual value`,
        hidden: !reset,
    };
}

export function validateManualAmount(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

export function UsageEntryForm({
    month,
    onStaged,
    provider,
}: {
    month: string;
    onStaged?: () => void;
    provider: string;
}) {
    const { stage } = useStaging();
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [funding, setFunding] = useState("prepaid");
    const [error, setError] = useState<string | null>(null);

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = validateManualAmount(amount);
                if (parsed === null) {
                    setError("Amount must be a number >= 0.");
                    return;
                }

                stage(
                    buildManualMeterChange({
                        amount: parsed,
                        currency,
                        funding,
                        month,
                        provider,
                    }),
                );
                setAmount("");
                setError(null);
                onStaged?.();
            }}
        >
            {error && <Alert intent="warning">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="amount"
                    aria-label="amount"
                    className="w-32"
                />
                <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    aria-label="currency"
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {["USD", "EUR", "GBP"].map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                <select
                    value={funding}
                    onChange={(event) => setFunding(event.target.value)}
                    aria-label="usage bucket"
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {USAGE_BUCKETS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <Button type="submit" size="sm">
                    Add
                </Button>
            </div>
        </form>
    );
}
