import { Field } from "@ark-ui/react";
import { type FC, useId } from "react";
import { cn } from "@/util.ts";
import {
    getSpendPolicyLabel,
    SPEND_POLICIES,
    type SpendPolicy,
} from "@/utils/spend-policy.ts";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";

type PollenBudgetInputProps = {
    value: number | null;
    onChange: (value: number | null) => void;
    spendPolicy: SpendPolicy;
    onSpendPolicyChange: (value: SpendPolicy) => void;
    showSpendPolicy?: boolean;
    disabled?: boolean;
    compact?: boolean;
    inline?: boolean;
};

/**
 * Reusable pollen budget input component.
 * - null = unlimited budget
 * - number = spending cap in pollen (supports decimals)
 */
export const PollenBudgetInput: FC<PollenBudgetInputProps> = ({
    value,
    onChange,
    spendPolicy,
    onSpendPolicyChange,
    showSpendPolicy = true,
    disabled = false,
    compact = false,
    inline = false,
}) => {
    const spendPolicyId = useId();
    const budgetInfoText = showSpendPolicy ? (
        <div className="space-y-2">
            <p>Set a spending limit for this key. Leave empty for unlimited.</p>
            <ul className="list-disc space-y-1 pl-4">
                <li>Auto: use free pollen first, then fall back to paid.</li>
                <li>Free only: never spend paid pollen.</li>
                <li>Paid only: skip free pollen and use pack or crypto.</li>
            </ul>
        </div>
    ) : (
        "Set a spending limit for this key. Leave empty for unlimited."
    );

    return (
        <Field.Root className={inline ? "flex items-start gap-3" : ""}>
            {!compact && (
                <Field.Label
                    className={`flex items-center gap-1.5 text-sm font-semibold ${inline ? "mb-0 shrink-0 pt-2" : "mb-2"}`}
                >
                    Budget
                    <InfoTip text={budgetInfoText} label="Budget information" />
                </Field.Label>
            )}
            <div
                className={cn(
                    "flex flex-wrap items-center gap-3",
                    inline && "flex-1",
                )}
            >
                <div className="flex items-center gap-2">
                    <Input
                        id="pollen-budget-input"
                        name="pollen-budget"
                        type="number"
                        min={0}
                        step={0.01}
                        value={value ?? ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            onChange(val === "" ? null : Number(val));
                        }}
                        className={`w-32 ${compact ? "text-sm" : ""}`}
                        placeholder="Unlimited"
                        disabled={disabled}
                    />
                    <span className="text-sm text-gray-500">pollen</span>
                </div>

                {showSpendPolicy && (
                    <div
                        className="inline-flex max-w-full flex-wrap rounded-xl border border-gray-200 bg-transparent p-1"
                        role="radiogroup"
                        aria-label="Spend policy"
                    >
                        {SPEND_POLICIES.map((policy) => {
                            const selected = spendPolicy === policy;
                            const inputId = `${spendPolicyId}-${policy}`;

                            return (
                                <div
                                    key={policy}
                                    className={cn(
                                        "flex items-center gap-1 rounded-lg px-1 transition-colors",
                                        selected
                                            ? "bg-rose-50 text-rose-900"
                                            : "bg-transparent text-gray-700 hover:bg-gray-50",
                                        disabled && "opacity-60",
                                    )}
                                >
                                    <input
                                        id={inputId}
                                        type="radio"
                                        name={spendPolicyId}
                                        value={policy}
                                        checked={selected}
                                        onChange={() =>
                                            onSpendPolicyChange(policy)
                                        }
                                        className="sr-only"
                                        disabled={disabled}
                                    />
                                    <label
                                        htmlFor={inputId}
                                        className={cn(
                                            "rounded-md px-2.5 py-2 text-center text-sm font-medium whitespace-nowrap transition-colors",
                                            compact && "text-xs",
                                            !disabled && "cursor-pointer",
                                            disabled &&
                                                "cursor-not-allowed opacity-60",
                                        )}
                                    >
                                        {getSpendPolicyLabel(policy)}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Field.Root>
    );
};
