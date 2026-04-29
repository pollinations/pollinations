import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";

export type BillingState = {
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        lastFailure: string | null;
        lastFailureAt: string | null;
    };
    paymentMethod: {
        hasDefault: boolean;
        brand: string | null;
        last4: string | null;
    };
    billingDetailsComplete: boolean;
};

type AutoTopUpPanelProps = {
    initialBillingState: BillingState | null;
};

const THRESHOLD_OPTIONS = [1, 2, 5, 10, 20, 50] as const;

export const AutoTopUpPanel: FC<AutoTopUpPanelProps> = ({
    initialBillingState,
}) => {
    const [billingState, setBillingState] = useState(initialBillingState);
    const [thresholdPollen, setThresholdPollen] = useState(
        initialBillingState?.autoTopUp.thresholdPollen ?? 5,
    );
    const [packAmountUsd, setPackAmountUsd] = useState(
        initialBillingState?.autoTopUp.packAmountUsd ?? 10,
    );
    const [isSaving, setIsSaving] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasPaymentMethod = billingState?.paymentMethod.hasDefault ?? false;
    const billingDetailsComplete =
        billingState?.billingDetailsComplete ?? false;
    const canEnable = hasPaymentMethod && billingDetailsComplete;
    const selectedPack = POLLEN_PACKS.find(
        (pack) => pack.amountUsd === packAmountUsd,
    );

    async function openBillingPortal(): Promise<void> {
        setIsOpeningPortal(true);
        setError(null);
        try {
            const response = await fetch("/api/stripe/billing/portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    flow: hasPaymentMethod
                        ? "default"
                        : "payment_method_update",
                }),
            });
            const payload = (await response.json()) as {
                url?: string;
                error?: string;
            };
            if (!response.ok || !payload.url) {
                throw new Error(payload.error ?? "Failed to open Stripe");
            }
            window.location.href = payload.url;
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to open Stripe",
            );
            setIsOpeningPortal(false);
        }
    }

    async function saveAutoTopUp(enabled: boolean): Promise<void> {
        setIsSaving(true);
        setError(null);
        try {
            const response = await fetch("/api/stripe/auto-top-up", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    enabled,
                    thresholdPollen,
                    packAmountUsd,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(
                    (payload as { error?: string }).error ??
                        "Failed to save auto top-up",
                );
            }
            const nextBillingState = payload as BillingState;
            setBillingState(nextBillingState);
            setThresholdPollen(nextBillingState.autoTopUp.thresholdPollen);
            setPackAmountUsd(nextBillingState.autoTopUp.packAmountUsd);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to save auto top-up",
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Card color="amber" className="mt-4 space-y-4 bg-white/90">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-amber-950 sm:text-xl">
                        Auto Top-Up
                    </h3>
                    <p className="text-sm text-amber-900">
                        Charge your Stripe default payment method when purchased
                        pollen falls below your threshold.
                    </p>
                </div>
                <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        billingState?.autoTopUp.enabled
                            ? "bg-amber-100 text-amber-900"
                            : "bg-gray-100 text-gray-700"
                    }`}
                >
                    {billingState?.autoTopUp.enabled ? "Enabled" : "Off"}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-amber-950">
                    <span>When below</span>
                    <select
                        value={thresholdPollen}
                        onChange={(event) =>
                            setThresholdPollen(Number(event.target.value))
                        }
                        className="w-full rounded-lg bg-amber-50 px-3 py-2 text-base text-amber-950"
                    >
                        {THRESHOLD_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                                {formatPollen(value)} pollen
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-amber-950">
                    <span>Top up with</span>
                    <select
                        value={packAmountUsd}
                        onChange={(event) =>
                            setPackAmountUsd(Number(event.target.value))
                        }
                        className="w-full rounded-lg bg-amber-50 px-3 py-2 text-base text-amber-950"
                    >
                        {POLLEN_PACKS.map((pack) => (
                            <option key={pack.amountUsd} value={pack.amountUsd}>
                                ${pack.amountUsd} -{" "}
                                {formatPollenPackValue(pack.pollenGrant)} pollen
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="rounded-lg bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                {hasPaymentMethod ? (
                    <span>
                        Stripe default: {billingState?.paymentMethod.brand} ****
                        {billingState?.paymentMethod.last4}
                    </span>
                ) : (
                    <span>No Stripe default payment method yet.</span>
                )}
                {!billingDetailsComplete && (
                    <span className="block pt-1">
                        Billing details are required before auto top-up can run.
                    </span>
                )}
                {selectedPack && (
                    <span className="block pt-1">
                        Auto top-up adds{" "}
                        {formatPollenPackValue(selectedPack.pollenGrant)} pollen
                        per charge.
                    </span>
                )}
            </div>

            {billingState?.autoTopUp.lastFailure && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {billingState.autoTopUp.lastFailure}
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    as="button"
                    color="amber"
                    weight="outline"
                    onClick={openBillingPortal}
                    disabled={isOpeningPortal}
                    className="w-full sm:w-auto"
                >
                    {isOpeningPortal ? "Opening Stripe..." : "Manage in Stripe"}
                </Button>

                <div className="flex flex-col gap-2 sm:flex-row">
                    {billingState?.autoTopUp.enabled && (
                        <Button
                            as="button"
                            color="dark"
                            weight="light"
                            onClick={() => saveAutoTopUp(false)}
                            disabled={isSaving}
                            className="w-full sm:w-auto"
                        >
                            Turn off
                        </Button>
                    )}
                    <Button
                        as="button"
                        color="amber"
                        weight="strong"
                        onClick={() => saveAutoTopUp(true)}
                        disabled={isSaving || !canEnable}
                        className="w-full sm:w-auto"
                    >
                        {billingState?.autoTopUp.enabled
                            ? "Save auto top-up"
                            : "Enable auto top-up"}
                    </Button>
                </div>
            </div>
        </Card>
    );
};
