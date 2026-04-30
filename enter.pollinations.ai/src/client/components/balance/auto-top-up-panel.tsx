import { type FC, type ReactNode, useEffect, useState } from "react";
import { apiClient } from "@/client/api.ts";
import {
    formatPollenPackValue,
    POLLEN_PACKS,
    type PollenPack,
} from "@/pollen-packs.ts";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { Badge } from "../ui/badge.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tooltip } from "../ui/tooltip.tsx";

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

const AUTO_TOP_UP_THRESHOLD_MIN = 1;
const AUTO_TOP_UP_THRESHOLD_MAX = 100;
const AUTO_TOP_UP_PACK_MIN = 5;
const AUTO_TOP_UP_PACK_MAX = 100;
const DEFAULT_THRESHOLD_POLLEN = 5;
const DEFAULT_PACK_AMOUNT_USD = 20;
const AUTO_TOP_UP_PACKS = POLLEN_PACKS.filter(
    (pack) =>
        pack.amountUsd >= AUTO_TOP_UP_PACK_MIN &&
        pack.amountUsd <= AUTO_TOP_UP_PACK_MAX,
);

export const AutoTopUpPanel: FC<AutoTopUpPanelProps> = ({
    initialBillingState,
}) => {
    const [billingState, setBillingState] = useState(initialBillingState);
    const [thresholdPollen, setThresholdPollen] = useState(
        normalizeThreshold(initialBillingState?.autoTopUp.thresholdPollen),
    );
    const [packAmountUsd, setPackAmountUsd] = useState(
        normalizePackAmount(initialBillingState?.autoTopUp.packAmountUsd),
    );
    const [isSaving, setIsSaving] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasPaymentMethod = billingState?.paymentMethod.hasDefault ?? false;
    const billingDetailsComplete =
        billingState?.billingDetailsComplete ?? false;
    const canEnable = hasPaymentMethod && billingDetailsComplete;
    const selectedPack = AUTO_TOP_UP_PACKS.find(
        (pack) => pack.amountUsd === packAmountUsd,
    );
    const isEnabled = billingState?.autoTopUp.enabled ?? false;
    const hasUnsavedChanges = billingState
        ? thresholdPollen !== billingState.autoTopUp.thresholdPollen ||
          packAmountUsd !== billingState.autoTopUp.packAmountUsd
        : false;
    const lastFailureTime = formatFailureTime(
        billingState?.autoTopUp.lastFailureAt ?? null,
    );

    useEffect(() => {
        setBillingState(initialBillingState);
        setThresholdPollen(
            normalizeThreshold(initialBillingState?.autoTopUp.thresholdPollen),
        );
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
            const payload = await readJsonPayload(response);
            const portalUrl = coerceString(payload.url);
            if (!response.ok || !portalUrl) {
                throw new Error(
                    getErrorMessage(payload, "Failed to open Stripe"),
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
                json: {
                    enabled,
                    thresholdPollen,
                    packAmountUsd,
                },
            });
            const payload = await readJsonPayload(response);
            if (!response.ok) {
                throw new Error(
                    getErrorMessage(payload, "Failed to save auto top-up"),
                );
            }
            const nextBillingState = payload as BillingState;
            setBillingState(nextBillingState);
            setThresholdPollen(
                normalizeThreshold(nextBillingState.autoTopUp.thresholdPollen),
            );
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
            <AutoTopUpActions
                isEnabled={isEnabled}
                paymentMethodReady={hasPaymentMethod}
                billingDetailsReady={billingDetailsComplete}
                canEnable={canEnable}
                hasSelectedPack={Boolean(selectedPack)}
                isSaving={isSaving}
                onToggle={(enabled) => saveAutoTopUp(enabled)}
            />

            <DividerGroup>
                <div className="grid gap-4">
                    <IntegerInput
                        label="When below"
                        info="Auto top-up runs when purchased pollen falls at or below this amount."
                        value={thresholdPollen}
                        min={AUTO_TOP_UP_THRESHOLD_MIN}
                        max={AUTO_TOP_UP_THRESHOLD_MAX}
                        onChange={setThresholdPollen}
                        disabled={isSaving}
                    />
                    <PackSlider
                        label="Top up with"
                        info="Choose the pollen pack Stripe will charge when auto top-up runs."
                        value={packAmountUsd}
                        onChange={setPackAmountUsd}
                        disabled={isSaving}
                    />
                    <AutoTopUpSaveChanges
                        isEnabled={isEnabled}
                        hasUnsavedChanges={hasUnsavedChanges}
                        paymentMethodReady={hasPaymentMethod}
                        billingDetailsReady={billingDetailsComplete}
                        hasSelectedPack={Boolean(selectedPack)}
                        isSaving={isSaving}
                        onSave={() => saveAutoTopUp(true)}
                    />
                </div>
            </DividerGroup>

            <DividerGroup>
                <BillingSetup
                    paymentMethodReady={hasPaymentMethod}
                    paymentMethodValue={formatPaymentMethod(billingState)}
                    billingDetailsReady={billingDetailsComplete}
                    billingDetailsValue={formatBillingDetails(billingState)}
                    onAction={openBillingPortal}
                    disabled={isOpeningPortal}
                    loading={isOpeningPortal}
                />
            </DividerGroup>

            {billingState?.autoTopUp.lastFailure && (
                <Notice role="alert">
                    {billingState.autoTopUp.lastFailure}
                    {lastFailureTime && (
                        <span className="block pt-1 text-red-700/75">
                            Last failed {lastFailureTime}
                        </span>
                    )}
                </Notice>
            )}

            {error && <Notice role="alert">{error}</Notice>}
        </div>
    );
};

type JsonPayload = {
    url?: string;
    error?: unknown;
    message?: unknown;
    autoTopUp?: BillingState["autoTopUp"];
    paymentMethod?: BillingState["paymentMethod"];
    billingDetails?: BillingState["billingDetails"];
    billingDetailsComplete?: boolean;
};

type SliderHeaderProps = {
    label: string;
    info: string;
    displayValue?: ReactNode;
};

const SliderHeader: FC<SliderHeaderProps> = ({ label, info, displayValue }) => (
    <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center text-[15px] font-bold text-amber-950">
                <span>{label}</span>
                <InfoTip
                    text={info}
                    label={`${label} information`}
                    tone="amber"
                />
            </div>
            {displayValue && (
                <div className="min-w-0 text-right text-sm font-bold text-amber-950 tabular-nums">
                    {displayValue}
                </div>
            )}
        </div>
    </div>
);

type IntegerInputProps = {
    label: string;
    info: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    disabled?: boolean;
};

const IntegerInput: FC<IntegerInputProps> = ({
    label,
    info,
    value,
    min,
    max,
    onChange,
    disabled = false,
}) => (
    <div className="space-y-2">
        <SliderHeader label={label} info={info} />
        <div className="flex items-center gap-2">
            <input
                type="number"
                min={min}
                max={max}
                step={1}
                inputMode="numeric"
                value={value}
                onChange={(event) => {
                    const next = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(next)) {
                        onChange(normalizeThreshold(next));
                    }
                }}
                onBlur={() => onChange(normalizeThreshold(value))}
                disabled={disabled}
                aria-label={label}
                className="w-28 rounded-lg border border-amber-300/70 bg-white/70 px-3 py-2 text-sm font-semibold text-amber-950 tabular-nums outline-none transition [appearance:textfield] focus:border-amber-500 focus:ring-2 focus:ring-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-sm font-medium text-amber-900">pollen</span>
        </div>
    </div>
);

type PackSliderProps = {
    label: string;
    info: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
};

const PackSlider: FC<PackSliderProps> = ({
    label,
    info,
    value,
    onChange,
    disabled = false,
}) => {
    const selectedIndex = Math.max(
        0,
        AUTO_TOP_UP_PACKS.findIndex((pack) => pack.amountUsd === value),
    );
    const selectedPack =
        AUTO_TOP_UP_PACKS[selectedIndex] ?? AUTO_TOP_UP_PACKS[0];
    const displayValue = selectedPack ? (
        <PackValueReadout pack={selectedPack} />
    ) : (
        "Unavailable"
    );
    const ariaValue = selectedPack
        ? formatPackValue(selectedPack)
        : "Unavailable";
    const progressPercent =
        AUTO_TOP_UP_PACKS.length > 1
            ? (selectedIndex / (AUTO_TOP_UP_PACKS.length - 1)) * 100
            : 100;

    return (
        <div className="space-y-3">
            <SliderHeader
                label={label}
                info={info}
                displayValue={displayValue}
            />
            <div className="flex h-8 items-center">
                <input
                    type="range"
                    min={0}
                    max={Math.max(0, AUTO_TOP_UP_PACKS.length - 1)}
                    step={1}
                    value={selectedIndex}
                    onChange={(event) => {
                        const pack =
                            AUTO_TOP_UP_PACKS[
                                Number(event.currentTarget.value)
                            ];
                        if (pack) onChange(pack.amountUsd);
                    }}
                    disabled={disabled}
                    aria-label={label}
                    aria-valuetext={ariaValue}
                    style={{
                        background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${progressPercent}%, #fde68a ${progressPercent}%, #fde68a 100%)`,
                    }}
                    className="h-2 w-full cursor-grab appearance-none rounded-full outline-none transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60 [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-amber-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(180,83,9,0.35)] [&::-moz-range-thumb]:transition-transform [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-amber-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(180,83,9,0.35)] [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-105"
                />
            </div>
            <div className="relative h-4 text-[10px] font-semibold text-amber-700/80 tabular-nums">
                {AUTO_TOP_UP_PACKS.map((pack, index) => {
                    const labelPercent =
                        AUTO_TOP_UP_PACKS.length > 1
                            ? (index / (AUTO_TOP_UP_PACKS.length - 1)) * 100
                            : 0;

                    return (
                        <span
                            key={pack.amountUsd}
                            style={{ left: `${labelPercent}%` }}
                            className={cn(
                                "absolute top-0",
                                index === 0
                                    ? "translate-x-0 text-left"
                                    : index === AUTO_TOP_UP_PACKS.length - 1
                                      ? "-translate-x-full text-right"
                                      : "-translate-x-1/2 text-center",
                            )}
                        >
                            ${pack.amountUsd}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

type PackValueReadoutProps = {
    pack: PollenPack;
};

const PackValueReadout: FC<PackValueReadoutProps> = ({ pack }) => {
    const bonusPercent = getPackBonusPercent(pack);
    const hasBonus = bonusPercent > 0;

    return (
        <span className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-amber-950">
                    ${pack.amountUsd}
                </span>
                <span className="text-amber-400">-&gt;</span>
                <span className="text-base font-bold text-amber-950">
                    {formatPollenPackValue(pack.pollenGrant)} pollen
                </span>
            </span>
            {hasBonus && (
                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        bonusPercent >= 60
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-amber-200 text-amber-900",
                    )}
                >
                    +{bonusPercent}% bonus
                </span>
            )}
        </span>
    );
};

type DividerGroupProps = {
    children: ReactNode;
};

const DividerGroup: FC<DividerGroupProps> = ({ children }) => (
    <div className="border-t border-amber-300/70 pt-4">{children}</div>
);

type AutoTopUpActionsProps = {
    isEnabled: boolean;
    paymentMethodReady: boolean;
    billingDetailsReady: boolean;
    canEnable: boolean;
    hasSelectedPack: boolean;
    isSaving: boolean;
    onToggle: (enabled: boolean) => void;
};

const AutoTopUpActions: FC<AutoTopUpActionsProps> = ({
    isEnabled,
    paymentMethodReady,
    billingDetailsReady,
    canEnable,
    hasSelectedPack,
    isSaving,
    onToggle,
}) => {
    const canToggleOn = canEnable && hasSelectedPack;
    const switchDisabled = isSaving || (!isEnabled && !canToggleOn);
    const switchDisabledReason = getSwitchDisabledReason({
        isEnabled,
        isSaving,
        hasSelectedPack,
        paymentMethodReady,
        billingDetailsReady,
    });

    return (
        <div className="flex min-w-0 items-center gap-3">
            <DisabledControlTooltip
                content={switchDisabled ? switchDisabledReason : null}
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
                        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60",
                        isEnabled
                            ? "border-amber-500 bg-amber-500"
                            : "border-amber-300 bg-amber-100",
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
                <div className="text-[15px] font-bold text-amber-950">
                    Auto top-up
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
    paymentMethodReady: boolean;
    billingDetailsReady: boolean;
    hasSelectedPack: boolean;
    isSaving: boolean;
    onSave: () => void;
};

const AutoTopUpSaveChanges: FC<AutoTopUpSaveChangesProps> = ({
    isEnabled,
    hasUnsavedChanges,
    paymentMethodReady,
    billingDetailsReady,
    hasSelectedPack,
    isSaving,
    onSave,
}) => {
    const saveDisabled =
        isSaving ||
        !isEnabled ||
        !paymentMethodReady ||
        !billingDetailsReady ||
        !hasSelectedPack ||
        !hasUnsavedChanges;
    const saveDisabledReason = getSaveDisabledReason({
        isEnabled,
        isSaving,
        hasUnsavedChanges,
        hasSelectedPack,
        paymentMethodReady,
        billingDetailsReady,
    });

    return (
        <div className="flex justify-start">
            <DisabledControlTooltip
                content={saveDisabled ? saveDisabledReason : null}
                className="w-full sm:w-auto"
            >
                <span className="inline-flex w-full sm:w-auto">
                    <Button
                        as="button"
                        type="button"
                        color="amber"
                        weight="strong"
                        onClick={onSave}
                        disabled={saveDisabled}
                        className="w-full sm:w-auto"
                    >
                        Save changes
                    </Button>
                </span>
            </DisabledControlTooltip>
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
        <Tooltip
            triggerAs="span"
            content={content}
            className={cn("inline-flex", className)}
        >
            {children}
        </Tooltip>
    );
};

type AutoTopUpActionState = {
    isEnabled: boolean;
    isSaving: boolean;
    hasSelectedPack: boolean;
    paymentMethodReady: boolean;
    billingDetailsReady: boolean;
};

function getSwitchDisabledReason({
    isEnabled,
    isSaving,
    hasSelectedPack,
    paymentMethodReady,
    billingDetailsReady,
}: AutoTopUpActionState): string | null {
    if (isSaving) return "Saving auto top-up...";
    if (isEnabled) return null;
    if (!hasSelectedPack) return "Choose a valid pollen pack first.";
    return getSetupDisabledReason(
        paymentMethodReady,
        billingDetailsReady,
        "enabling auto top-up",
    );
}

function getSaveDisabledReason({
    isEnabled,
    isSaving,
    hasUnsavedChanges,
    hasSelectedPack,
    paymentMethodReady,
    billingDetailsReady,
}: AutoTopUpActionState & { hasUnsavedChanges: boolean }): string | null {
    if (isSaving) return "Saving changes...";
    if (!hasSelectedPack) return "Choose a valid pollen pack first.";

    const setupReason = getSetupDisabledReason(
        paymentMethodReady,
        billingDetailsReady,
        "saving changes",
    );
    if (setupReason) return setupReason;

    if (!isEnabled) return "Use the switch to enable auto top-up first.";
    if (!hasUnsavedChanges) return "No changes to save.";
    return null;
}

function getSetupDisabledReason(
    paymentMethodReady: boolean,
    billingDetailsReady: boolean,
    action: string,
): string | null {
    if (!paymentMethodReady && !billingDetailsReady) {
        return `Add a default payment method and billing details in Stripe before ${action}.`;
    }
    if (!paymentMethodReady) {
        return `Add a default payment method in Stripe before ${action}.`;
    }
    if (!billingDetailsReady) {
        return `Add billing details in Stripe before ${action}.`;
    }
    return null;
}

type BillingSetupProps = {
    paymentMethodReady: boolean;
    paymentMethodValue: string;
    billingDetailsReady: boolean;
    billingDetailsValue: ReactNode;
    onAction: () => void;
    disabled: boolean;
    loading: boolean;
};

const BillingSetup: FC<BillingSetupProps> = ({
    paymentMethodReady,
    paymentMethodValue,
    billingDetailsReady,
    billingDetailsValue,
    onAction,
    disabled,
    loading,
}) => (
    <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
            <SetupSnippet
                title="Payment method"
                badge={paymentMethodReady ? "Ready" : "Required"}
                badgeColor={paymentMethodReady ? "green" : "red"}
                value={paymentMethodValue}
            />
            <SetupSnippet
                title="Billing details"
                badge={billingDetailsReady ? "Ready" : "Required"}
                badgeColor={billingDetailsReady ? "green" : "red"}
                value={billingDetailsValue}
            />
        </div>
        <Button
            as="button"
            type="button"
            color="amber"
            weight="light"
            onClick={onAction}
            disabled={disabled}
            className="btn-shimmer w-full min-w-0 gap-2 whitespace-nowrap border border-amber-300/70 px-3 text-center text-xs shadow-none sm:w-fit sm:text-sm"
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
    badge: string;
    badgeColor: "green" | "red";
    value: ReactNode;
};

const SetupSnippet: FC<SetupSnippetProps> = ({
    title,
    badge,
    badgeColor,
    value,
}) => (
    <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-amber-950">
                {title}
            </span>
            <Badge color={badgeColor} size="sm">
                {badge}
            </Badge>
        </div>
        <div className="break-words text-sm font-medium leading-relaxed text-amber-950">
            {value}
        </div>
    </div>
);

type NoticeProps = {
    children: ReactNode;
    role?: "alert" | "status";
};

const Notice: FC<NoticeProps> = ({ children, role }) => (
    <div
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role={role}
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

    const primary = details.name ?? details.email;
    const streets = [details.line1, details.line2].filter(Boolean).join(", ");
    const cityRegionPostal = [details.city, details.state, details.postalCode]
        .filter(Boolean)
        .join(" ");
    const cityAndCountry = [cityRegionPostal, details.country]
        .filter(Boolean)
        .join(", ");
    const lines = [
        { key: "primary", value: primary },
        { key: "streets", value: streets },
        { key: "city-country", value: cityAndCountry },
    ].filter((line): line is { key: string; value: string } =>
        Boolean(line.value),
    );

    if (!lines.length) return "None";

    return (
        <span className="block space-y-0.5">
            {lines.map((line) => (
                <span key={line.key} className="block">
                    {line.value}
                </span>
            ))}
        </span>
    );
}

function formatPackValue(pack: PollenPack): string {
    const bonusPercent = getPackBonusPercent(pack);
    const bonusLabel = bonusPercent > 0 ? `, +${bonusPercent}% bonus` : "";

    return `$${pack.amountUsd} to ${formatPollenPackValue(pack.pollenGrant)} pollen${bonusLabel}`;
}

function getPackBonusPercent(pack: PollenPack): number {
    if (!pack.amountUsd) return 0;

    return Math.round((pack.bonusPollen / pack.amountUsd) * 100);
}

function normalizeThreshold(value: number | null | undefined): number {
    const numeric =
        typeof value === "number" && Number.isFinite(value)
            ? value
            : DEFAULT_THRESHOLD_POLLEN;
    const integer = Math.round(numeric);

    return Math.min(
        AUTO_TOP_UP_THRESHOLD_MAX,
        Math.max(AUTO_TOP_UP_THRESHOLD_MIN, integer),
    );
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

async function readJsonPayload(response: Response): Promise<JsonPayload> {
    const payload = await response.json().catch(() => ({}));
    return payload as JsonPayload;
}

function getErrorMessage(
    payload: { error?: unknown; message?: unknown },
    fallback: string,
): string {
    return (
        coerceMessage(payload.error) ??
        coerceMessage(payload.message) ??
        fallback
    );
}

function coerceString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function coerceMessage(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return null;

    if ("message" in value) {
        return coerceMessage(value.message);
    }

    if ("error" in value) {
        return coerceMessage(value.error);
    }

    return null;
}
