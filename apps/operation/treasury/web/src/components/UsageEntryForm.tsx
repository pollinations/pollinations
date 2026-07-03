import { Alert, Button, Input, Text } from "@pollinations/ui";
import type { ReactNode } from "react";
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
    provider,
    retrievedAt = todayDate(),
}: {
    amount: number;
    funding: string;
    month: string;
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
            note: "entered in treasury app",
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
            className="flex flex-col gap-3"
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
            <div className="flex flex-wrap gap-2">
                <ModeOption
                    checked={mode === "used"}
                    label="used this month"
                    onChange={() => setMode("used")}
                >
                    Drives this month's burn and P&L.
                </ModeOption>
                <ModeOption
                    checked={mode === "left"}
                    label="left on grant now"
                    onChange={() => setMode("left")}
                >
                    Updates balance display only; it does not create monthly
                    burn.
                </ModeOption>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <Field label="amount_usd">
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="w-32"
                    />
                </Field>
                {mode === "used" && (
                    <Field label="funding">
                        <select
                            value={funding}
                            onChange={(event) => setFunding(event.target.value)}
                            className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                        >
                            {FUNDING_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                <Button type="submit" size="sm">
                    Stage
                </Button>
            </div>
        </form>
    );
}

function ModeOption({
    checked,
    children,
    label,
    onChange,
}: {
    checked: boolean;
    children: ReactNode;
    label: string;
    onChange: () => void;
}) {
    return (
        <label className="flex min-w-60 flex-1 gap-2 rounded border border-theme-border/70 bg-theme-bg/50 p-3 text-sm">
            <input
                type="radio"
                checked={checked}
                onChange={onChange}
                className="mt-1"
            />
            <span>
                <Text as="span" weight="bold" className="block">
                    {label}
                </Text>
                <Text as="span" tone="soft" className="block">
                    {children}
                </Text>
            </span>
        </label>
    );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
    return (
        <div className="flex flex-col gap-1 text-xs font-bold uppercase text-theme-text-soft">
            <span>{label}</span>
            {children}
        </div>
    );
}
