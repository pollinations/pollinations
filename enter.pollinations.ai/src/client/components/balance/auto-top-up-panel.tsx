import { type FC, type ReactNode, useEffect, useState } from "react";
import { apiClient } from "@/client/api.ts";
import { POLLEN_PACKS, type PollenPack } from "@/pollen-packs.ts";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tag } from "../ui/tag.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import {
    PollenPackBonusPill,
    PollenPackReadout,
    PollenPackSlider,
} from "./pollen-pack-controls.tsx";

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
    billingDetails: {
        name: string | null;
        email: string | null;
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
    } | null;
    billingDetailsComplete: boolean;
};

type AutoTopUpPanelProps = {
    initialBillingState: BillingState | null;
};

const AUTO_TOP_UP_PACK_MIN = 10;
const AUTO_TOP_UP_PACK_MAX = 100;
const DEFAULT_PACK_AMOUNT_USD = 20;
const DIVIDER_CLASS = "border-t border-amber-300/70 pt-4";
const AUTO_TOP_UP_TOOLTIP =
    "Auto top-up charges your Stripe default payment method for the selected pollen pack when purchased pollen is at or below 5 pollen.";
const AUTO_TOP_UP_PACKS = POLLEN_PACKS.filter(
    (pack) =>
        pack.amountUsd >= AUTO_TOP_UP_PACK_MIN &&
        pack.amountUsd <= AUTO_TOP_UP_PACK_MAX,
);

type SetupReadiness = {
    paymentMethodReady: boolean;
    billingDetailsReady: boolean;
    hasSelectedPack: boolean;
    isSaving: boolean;
};

export const AutoTopUpPanel: FC<AutoTopUpPanelProps> = ({
    initialBillingState,
}) => {
    const [billingState, setBillingState] = useState(initialBillingState);
    const [packAmountUsd, setPackAmountUsd] = useState(
        normalizePackAmount(initialBillingState?.autoTopUp.packAmountUsd),
    );
    const [isSaving, setIsSaving] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const paymentMethodReady = billingState?.paymentMethod.hasDefault ?? false;
    const billingDetailsReady = billingState?.billingDetailsComplete ?? false;
    const selectedPack = AUTO_TOP_UP_PACKS.find(
        (pack) => pack.amountUsd === packAmountUsd,
    );
    const isEnabled = billingState?.autoTopUp.enabled ?? false;
    const hasUnsavedChanges =
        billingState !== null &&
        packAmountUsd !== billingState.autoTopUp.packAmountUsd;
    const lastFailureTime = formatFailureTime(
        billingState?.autoTopUp.lastFailureAt ?? null,
    );

    const setup: SetupReadiness = {
        paymentMethodReady,
        billingDetailsReady,
        hasSelectedPack: Boolean(selectedPack),
        isSaving,
    };

    useEffect(() => {
        setBillingState(initialBillingState);
        setPackAmountUsd(
            normalizePackAmount(initialBillingState?.autoTopUp.packAmountUsd),
        );
    }, [initialBillingState]);

    async function openBillingPortal(): Promise<void> {
        setIsOpeningPortal(true);
        setError(null);
        try {
            const response = await apiClient.stripe.billing.portal.$post({
                json: { flow: "default" },
            });
            const payload = (await response.json().catch(() => ({}))) as {
                url?: unknown;
                error?: unknown;
            };
            const portalUrl =
                typeof payload.url === "string" ? payload.url : null;
            if (!response.ok || !portalUrl) {
                throw new Error(
                    extractErrorMessage(payload, "Failed to open Stripe"),
                );
            }
            window.location.href = portalUrl;
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
            const response = await apiClient.stripe["auto-top-up"].$patch({
                json: { enabled, packAmountUsd },
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    extractErrorMessage(payload, "Failed to save auto top-up"),
                );
            }
            const nextBillingState = payload as BillingState;
            setBillingState(nextBillingState);
            setPackAmountUsd(
                normalizePackAmount(nextBillingState.autoTopUp.packAmountUsd),
            );
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
        <div className="space-y-4">
            <AutoTopUpToggle
                isEnabled={isEnabled}
                setup={setup}
                onToggle={(enabled) => saveAutoTopUp(enabled)}
            />

            <div className={cn(DIVIDER_CLASS, "grid gap-4")}>
                <PollenPackSlider
                    value={packAmountUsd}
                    onChange={setPackAmountUsd}
                    packs={AUTO_TOP_UP_PACKS}
                    disabled={isSaving}
                />
                <AutoTopUpSaveChanges
                    isEnabled={isEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    setup={setup}
                    selectedPack={selectedPack}
                    onSave={() => saveAutoTopUp(true)}
                />
            </div>

            <div className={DIVIDER_CLASS}>
                <BillingSetup
                    paymentMethodReady={paymentMethodReady}
                    paymentMethodValue={formatPaymentMethod(billingState)}
                    billingDetailsReady={billingDetailsReady}
                    billingDetailsValue={formatBillingDetails(billingState)}
                    onAction={openBillingPortal}
                    loading={isOpeningPortal}
                />
            </div>

            {billingState?.autoTopUp.lastFailure && (
                <ErrorNotice>
                    {billingState.autoTopUp.lastFailure}
                    {lastFailureTime && (
                        <span className="block pt-1 text-red-700/75">
                            Last failed {lastFailureTime}
                        </span>
                    )}
                </ErrorNotice>
            )}

            {error && <ErrorNotice>{error}</ErrorNotice>}
        </div>
    );
};

type AutoTopUpToggleProps = {
    isEnabled: boolean;
    setup: SetupReadiness;
    onToggle: (enabled: boolean) => void;
};

const AutoTopUpToggle: FC<AutoTopUpToggleProps> = ({
    isEnabled,
    setup,
    onToggle,
}) => {
    const switchDisabled = setup.isSaving || (!isEnabled && !canEnable(setup));
    const disabledReason = isEnabled
        ? null
        : getDisabledReason(setup, "enabling auto top-up");

    return (
        <div className="flex min-w-0 items-center gap-3">
            <DisabledControlTooltip
                content={switchDisabled ? disabledReason : null}
                className="shrink-0"
            >
                <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={
                        isEnabled
                            ? "Turn off auto top-up"
                            : "Enable auto top-up"
                    }
                    onClick={() => onToggle(!isEnabled)}
                    disabled={switchDisabled}
                    className={cn(
                        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-amber-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60",
                        isEnabled ? "bg-amber-200" : "bg-amber-100",
                    )}
                >
                    <span
                        className={cn(
                            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                            isEnabled ? "translate-x-6" : "translate-x-1",
                        )}
                    />
                </button>
            </DisabledControlTooltip>
            <div className="min-w-0">
                <div className="flex min-w-0 items-center text-[15px] font-bold text-amber-950">
                    Auto top-up
                    <InfoTip
                        text={AUTO_TOP_UP_TOOLTIP}
                        label="Auto top-up information"
                        tone="amber"
                    />
                </div>
                <div className="text-xs font-medium text-amber-800/75">
                    {isEnabled ? "On" : "Off"}
                </div>
            </div>
        </div>
    );
};

type AutoTopUpSaveChangesProps = {
    isEnabled: boolean;
    hasUnsavedChanges: boolean;
    setup: SetupReadiness;
    selectedPack?: PollenPack;
    onSave: () => void;
};

const AutoTopUpSaveChanges: FC<AutoTopUpSaveChangesProps> = ({
    isEnabled,
    hasUnsavedChanges,
    setup,
    selectedPack,
    onSave,
}) => {
    const saveDisabled = !isEnabled || !canEnable(setup) || !hasUnsavedChanges;
    const disabledReason = getSaveDisabledReason({
        isEnabled,
        hasUnsavedChanges,
        ...setup,
    });

    return (
        <div className="flex flex-wrap items-center gap-2">
            <DisabledControlTooltip
                content={saveDisabled ? disabledReason : null}
                className="w-full sm:w-auto"
            >
                <Button
                    as="button"
                    type="button"
                    color="amber"
                    weight="light"
                    onClick={onSave}
                    disabled={saveDisabled}
                    className="btn-shimmer w-full min-w-0 border border-amber-300/70 text-center shadow-none sm:w-fit"
                >
                    <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
                        <span>Save</span>
                        {selectedPack && (
                            <PollenPackReadout
                                pack={selectedPack}
                                showBonus={false}
                                tone="button"
                            />
                        )}
                    </span>
                </Button>
            </DisabledControlTooltip>
            {selectedPack && (
                <PollenPackBonusPill
                    pack={selectedPack}
                    className="w-full text-center sm:w-auto sm:text-left"
                />
            )}
        </div>
    );
};

type DisabledControlTooltipProps = {
    children: ReactNode;
    content: ReactNode | null;
    className?: string;
};

const DisabledControlTooltip: FC<DisabledControlTooltipProps> = ({
    children,
    content,
    className,
}) => {
    if (!content) return children;

    return (
        <Tooltip triggerAs="span" content={content} className={className}>
            {children}
        </Tooltip>
    );
};

function canEnable(setup: SetupReadiness): boolean {
    return (
        setup.paymentMethodReady &&
        setup.billingDetailsReady &&
        setup.hasSelectedPack
    );
}

function getDisabledReason(
    setup: SetupReadiness,
    action: string,
): string | null {
    if (setup.isSaving) return "Saving auto top-up...";
    if (!setup.hasSelectedPack) return "Choose a valid pollen pack first.";
    if (!setup.paymentMethodReady && !setup.billingDetailsReady) {
        return `Add a default payment method and billing details in Stripe before ${action}.`;
    }
    if (!setup.paymentMethodReady) {
        return `Add a default payment method in Stripe before ${action}.`;
    }
    if (!setup.billingDetailsReady) {
        return `Add billing details in Stripe before ${action}.`;
    }
    return null;
}

function getSaveDisabledReason(
    state: SetupReadiness & {
        isEnabled: boolean;
        hasUnsavedChanges: boolean;
    },
): string | null {
    const setupReason = getDisabledReason(state, "saving changes");
    if (setupReason) return setupReason;
    if (!state.isEnabled) return "Use the switch to enable auto top-up first.";
    if (!state.hasUnsavedChanges) return "No changes to save.";
    return null;
}

type BillingSetupProps = {
    paymentMethodReady: boolean;
    paymentMethodValue: string;
    billingDetailsReady: boolean;
    billingDetailsValue: ReactNode;
    onAction: () => void;
    loading: boolean;
};

const BillingSetup: FC<BillingSetupProps> = ({
    paymentMethodReady,
    paymentMethodValue,
    billingDetailsReady,
    billingDetailsValue,
    onAction,
    loading,
}) => (
    <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
            <SetupSnippet
                title="Billing details"
                ready={billingDetailsReady}
                value={billingDetailsValue}
            />
            <SetupSnippet
                title="Payment method"
                ready={paymentMethodReady}
                value={paymentMethodValue}
            />
        </div>
        <Button
            as="button"
            type="button"
            color="amber"
            weight="light"
            onClick={onAction}
            disabled={loading}
            className="btn-shimmer w-fit max-w-full min-w-0 self-start gap-2 whitespace-nowrap border border-amber-300/70 text-center shadow-none"
        >
            <span>
                {loading ? "Opening Stripe..." : "Manage billing details"}
            </span>
            {!loading && <ExternalLinkIcon />}
        </Button>
    </div>
);

type SetupSnippetProps = {
    title: string;
    ready: boolean;
    value: ReactNode;
};

const SetupSnippet: FC<SetupSnippetProps> = ({ title, ready, value }) => (
    <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-amber-950">
                {title}
            </span>
            <Tag color={ready ? "green" : "pink"} size="sm">
                {ready ? "Ready" : "Required"}
            </Tag>
        </div>
        <div className="break-words text-sm font-medium leading-relaxed text-amber-950">
            {value}
        </div>
    </div>
);

const ErrorNotice: FC<{ children: ReactNode }> = ({ children }) => (
    <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
        {children}
    </div>
);

const ExternalLinkIcon: FC = () => (
    <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-amber-700/70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
    >
        <path
            d="M7 17 17 7M9 7h8v8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

function formatPaymentMethod(billingState: BillingState | null): string {
    if (!billingState) return "Unavailable";
    const { paymentMethod } = billingState;
    if (!paymentMethod.hasDefault) return "None";
    const brand = paymentMethod.brand ?? "Card";
    return paymentMethod.last4 ? `${brand} ****${paymentMethod.last4}` : brand;
}

function formatBillingDetails(billingState: BillingState | null): ReactNode {
    const details = billingState?.billingDetails;
    if (!details) return "None";

    const lines: string[] = [];
    const primary = details.name ?? details.email;
    if (primary) lines.push(primary);

    const street = joinNonEmpty([details.line1, details.line2], ", ");
    if (street) lines.push(street);

    const cityRegion = joinNonEmpty(
        [details.city, details.state, details.postalCode],
        " ",
    );
    const cityCountry = joinNonEmpty([cityRegion, details.country], ", ");
    if (cityCountry) lines.push(cityCountry);

    if (!lines.length) return "None";

    return (
        <span className="block space-y-0.5">
            {lines.map((line) => (
                <span key={line} className="block">
                    {line}
                </span>
            ))}
        </span>
    );
}

function joinNonEmpty(
    parts: ReadonlyArray<string | null | undefined>,
    separator: string,
): string {
    return parts
        .filter((part): part is string => Boolean(part))
        .join(separator);
}

function normalizePackAmount(value: number | null | undefined): number {
    const numeric =
        typeof value === "number" && Number.isFinite(value)
            ? value
            : DEFAULT_PACK_AMOUNT_USD;
    const firstPack = AUTO_TOP_UP_PACKS[0];
    if (!firstPack) return DEFAULT_PACK_AMOUNT_USD;

    return AUTO_TOP_UP_PACKS.reduce(
        (closest, pack) =>
            Math.abs(pack.amountUsd - numeric) <
            Math.abs(closest.amountUsd - numeric)
                ? pack
                : closest,
        firstPack,
    ).amountUsd;
}

function formatFailureTime(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function extractErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const { error, message } = payload as {
        error?: unknown;
        message?: unknown;
    };
    if (typeof error === "string") return error;
    if (typeof message === "string") return message;
    return fallback;
}
