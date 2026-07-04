import { Alert, Button, Input } from "@pollinations/ui";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";

const USAGE_BUCKETS = [
    { label: "prepaid usage", value: "prepaid" },
    { label: "credit usage", value: "credit" },
];

export function buildManualMeterChange({
    amount,
    funding,
    month,
    provider,
}: {
    amount: number;
    funding: string;
    month: string;
    provider: string;
}): StageInput {
    return {
        datasource: "meter_monthly",
        key: `meter:${provider}:${month}:${funding}`,
        row: {
            month,
            provider,
            cost_usd: amount,
            funding,
            source: "manual",
        },
        summary: `usage ${provider} ${month} ${funding} -> ${amount}`,
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
                    aria-label="amount_usd"
                    className="w-32"
                />
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
