import { Alert, Button, Input, Text } from "@pollinations/ui";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";

const FUNDING_OPTIONS = ["credit", "cash", "prepaid"];

function todayDate() {
    return new Date().toISOString().slice(0, 10);
}

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildManualMeterChange({
    amount,
    funding,
    month,
    note = "entered in treasury app",
    provider,
    retrievedAt = todayDate(),
}: {
    amount: number;
    funding: string;
    month: string;
    note?: string;
    provider: string;
    retrievedAt?: string;
}): StageInput {
    return {
        datasource: "meter_monthly",
        row: {
            month,
            provider,
            cost_usd: amount,
            funding,
            source: "manual",
            retrieved_at: retrievedAt,
            note,
        },
        summary: `meter ${provider} ${month} ${funding} -> ${amount}`,
    };
}

export function buildManualBalanceChange({
    amount,
    provider,
    runAt = nowDateTime(),
}: {
    amount: number;
    provider: string;
    runAt?: string;
}): StageInput {
    return {
        datasource: "balances",
        row: {
            run_at: runAt,
            provider,
            granted_usd: null,
            spent_usd: null,
            left_usd: amount,
            prepaid_left_usd: null,
            source: "manual",
            note: "entered in treasury app",
        },
        summary: `balance ${provider} left_usd -> ${amount}`,
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
    const [mode, setMode] = useState<"used" | "left">("used");
    const [amount, setAmount] = useState("");
    const [funding, setFunding] = useState("credit");
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
                    mode === "used"
                        ? buildManualMeterChange({
                              amount: parsed,
                              funding,
                              month,
                              provider,
                          })
                        : buildManualBalanceChange({
                              amount: parsed,
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
                <select
                    value={mode}
                    onChange={(event) =>
                        setMode(event.target.value as "used" | "left")
                    }
                    aria-label="entry kind"
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    <option value="used">used this month</option>
                    <option value="left">left on grant now</option>
                </select>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="amount USD"
                    aria-label="amount_usd"
                    className="w-32"
                />
                {mode === "used" && (
                    <select
                        value={funding}
                        onChange={(event) => setFunding(event.target.value)}
                        aria-label="funding"
                        className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        {FUNDING_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                )}
                <Button type="submit" size="sm">
                    Stage
                </Button>
            </div>
            <Text size="sm" tone="soft">
                {mode === "used"
                    ? "Counts as this month's burn."
                    : "Updates the pool balance display only — no monthly burn."}
            </Text>
        </form>
    );
}
