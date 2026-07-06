import { Alert, Button, Input } from "@pollinations/ui";
import { useState } from "react";
import { utcDateTime } from "../lib/format";
import { type StageInput, useStaging } from "../lib/staging";

export function buildManualMeterChange({
    cashAmount,
    creditAmount,
    currency,
    month,
    provider,
}: {
    cashAmount: number;
    creditAmount: number;
    currency: string;
    month: string;
    provider: string;
}): StageInput {
    return {
        datasource: "meter_monthly",
        key: `meter:${provider}:${month}:${currency}`,
        row: {
            month,
            provider,
            currency,
            credit_amount: creditAmount,
            cash_amount: cashAmount,
            source: "manual",
        },
        summary: `usage ${provider} ${month} -> credit ${creditAmount} ${currency}, cash ${cashAmount} ${currency}`,
    };
}

export function meterOverrideKey({
    currency,
    month,
    provider,
}: {
    currency: string;
    month: string;
    provider: string;
}) {
    return `${provider}|${month}|${currency}`;
}

export function buildMeterManualResetChange({
    enteredAt = utcDateTime(),
    currency,
    month,
    provider,
    reset,
}: {
    enteredAt?: string;
    currency: string;
    month: string;
    provider: string;
    reset: boolean;
}): StageInput {
    const key = meterOverrideKey({ currency, month, provider });
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
            ? `usage ${provider} ${month} ${currency} reset manual value`
            : `usage ${provider} ${month} ${currency} keep manual value`,
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
    const [creditAmount, setCreditAmount] = useState("");
    const [cashAmount, setCashAmount] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [error, setError] = useState<string | null>(null);

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                const parsedCredit = validateManualAmount(creditAmount || "0");
                const parsedCash = validateManualAmount(cashAmount || "0");
                if (parsedCredit === null || parsedCash === null) {
                    setError("Amounts must be numbers >= 0.");
                    return;
                }
                if (parsedCredit === 0 && parsedCash === 0) {
                    setError("Enter credit or cash usage.");
                    return;
                }

                stage(
                    buildManualMeterChange({
                        cashAmount: parsedCash,
                        creditAmount: parsedCredit,
                        currency,
                        month,
                        provider,
                    }),
                );
                setCreditAmount("");
                setCashAmount("");
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
                    value={creditAmount}
                    onChange={(event) => setCreditAmount(event.target.value)}
                    placeholder="credit"
                    aria-label="credit amount"
                    className="w-32"
                />
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashAmount}
                    onChange={(event) => setCashAmount(event.target.value)}
                    placeholder="cash"
                    aria-label="cash amount"
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
                <Button type="submit" size="sm">
                    Add
                </Button>
            </div>
        </form>
    );
}
