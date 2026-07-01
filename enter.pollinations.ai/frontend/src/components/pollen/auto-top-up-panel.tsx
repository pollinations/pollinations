import { apiClient } from "@frontend/api.ts";
import {
    Button,
    CardIcon,
    CheckIcon,
    cn,
    ExternalLinkButton,
    InfoTip,
    Switch,
    type SwitchStatus,
    Tooltip,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
} from "@shared/billing/auto-top-up.ts";
import {
    calculateServiceFeeCents,
    formatUsdCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import {
    type FC,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from "react";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

export type AutoTopUpIssue =
    | {
          kind: "failed";
          reason: string;
          occurredAt: string;
      }
    | {
          kind: "pending_payment";
          invoiceUrl: string;
          occurredAt: string;
      };

export type BillingState = {
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        serviceFeeCents: number;
        lastIssue: AutoTopUpIssue | null;
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

const DEFAULT_PACK_AMOUNT_USD = 10;
const AUTO_TOP_UP_DRAFT_STORAGE_KEY = "pollinations:auto-top-up-draft";
const AutoTopUpTooltipContent: FC = () => (
    <div className="space-y-2 text-theme-text-base">
        <div>
            Keeps your{" "}
            <span className="font-semibold text-theme-text-strong">
                paid balance
            </span>{" "}
            topped up automatically.
        </div>
        <ul className="list-disc space-y-1 pl-4 text-theme-text-muted">
            <li>
                Runs at{" "}
                <span className="font-semibold text-theme-text-strong">
                    5 pollen or below
                </span>
            </li>
            <li>
                Charges your{" "}
                <span className="font-semibold text-theme-text-strong">
                    default Stripe card
                </span>{" "}
                for the selected pack, plus applicable tax and service fee
            </li>
            <li>
                <span className="inline-flex items-center gap-1 font-semibold text-theme-text-strong">
                    <WalletKindIcon kind="tier" />
                    Quest Pollen is ignored
                </span>{" "}
                for this trigger
            </li>
        </ul>
    </div>
);
const AUTO_TOP_UP_PACKS = POLLEN_PACKS.filter(
    (pack) =>
        pack.amountUsd >= AUTO_TOP_UP_PACK_MIN_USD &&
        pack.amountUsd <= AUTO_TOP_UP_PACK_MAX_USD,
);

type SetupReadiness = {
    paymentMethodReady: boolean;
    billingDetailsReady: boolean;
    hasSelectedPack: boolean;
    isSaving: boolean;
};

type ToggleStatus = "off" | "draft" | "on";

export const AutoTopUpPanel: FC<AutoTopUpPanelProps> = ({
    initialBillingState,
}) => {
    const [billingState, setBillingState] = useState(initialBillingState);
    const [packAmountUsd, setPackAmountUsd] = useState(
        normalizePackAmount(initialBillingState?.autoTopUp.packAmountUsd),
    );
    const [enableDraft, setEnableDraft] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const paymentMethodReady = billingState?.paymentMethod.hasDefault ?? false;
    const billingDetailsReady = billingState?.billingDetailsComplete ?? false;
    const selectedPack = AUTO_TOP_UP_PACKS.find(
        (pack) => pack.amountUsd === packAmountUsd,
    );
    const isEnabled = billingState?.autoTopUp.enabled ?? false;
    const serviceFeeCents = selectedPack
        ? calculateServiceFeeCents(selectedPack.amountUsd * 100)
        : 0;
    const subtotalBeforeTaxCents =
        (selectedPack?.amountUsd ?? 0) * 100 + serviceFeeCents;
    const chargeLabel = selectedPack
        ? formatUsdCentsCompact(subtotalBeforeTaxCents)
        : "$0";
    const showConfig = isEnabled || enableDraft;
    const hasUnsavedChanges =
        billingState !== null &&
        showConfig &&
        (!isEnabled || packAmountUsd !== billingState.autoTopUp.packAmountUsd);
    const setup: SetupReadiness = {
        paymentMethodReady,
        billingDetailsReady,
        hasSelectedPack: Boolean(selectedPack),
        isSaving,
    };
    const toggleStatus: ToggleStatus = isEnabled
        ? "on"
        : enableDraft
          ? "draft"
          : "off";

    useEffect(() => {
        setBillingState(initialBillingState);
        const draftPackAmountUsd = isStripeBillingReturn()
            ? readAutoTopUpDraftPackAmount()
            : null;
        if (
            draftPackAmountUsd !== null &&
            !initialBillingState?.autoTopUp.enabled
        ) {
            setPackAmountUsd(normalizePackAmount(draftPackAmountUsd));
            setEnableDraft(true);
            return;
        }

        if (initialBillingState?.autoTopUp.enabled) clearAutoTopUpDraft();
        setPackAmountUsd(
            normalizePackAmount(initialBillingState?.autoTopUp.packAmountUsd),
        );
        setEnableDraft(false);
    }, [initialBillingState]);

    async function openBillingPortal(): Promise<void> {
        setIsOpeningPortal(true);
        setError(null);
        try {
            if (enableDraft) {
                writeAutoTopUpDraftPackAmount(packAmountUsd);
            } else {
                clearAutoTopUpDraft();
            }
            const response = await apiClient.stripe.billing.portal.$post({
                json: {},
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

    const saveAutoTopUp = useCallback(
        async (enabled: boolean): Promise<boolean> => {
            setIsSaving(true);
            setError(null);
            try {
                const response = await apiClient.stripe["auto-top-up"].$patch({
                    json: { enabled, packAmountUsd },
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(
                        extractErrorMessage(
                            payload,
                            "Failed to save auto top-up",
                        ),
                    );
                }
                const nextBillingState = payload as BillingState;
                setBillingState(nextBillingState);
                setPackAmountUsd(
                    normalizePackAmount(
                        nextBillingState.autoTopUp.packAmountUsd,
                    ),
                );
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to save auto top-up",
                );
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [packAmountUsd],
    );

    const handleToggle = useCallback(
        (next: boolean) => {
            if (next) {
                if (!isEnabled) setEnableDraft(true);
            } else {
                if (enableDraft) {
                    setEnableDraft(false);
                    clearAutoTopUpDraft();
                } else if (isEnabled) {
                    void saveAutoTopUp(false);
                }
            }
        },
        [enableDraft, isEnabled, saveAutoTopUp],
    );

    const handleSave = useCallback(async () => {
        const saved = await saveAutoTopUp(true);
        if (saved) {
            setEnableDraft(false);
            clearAutoTopUpDraft();
        }
    }, [saveAutoTopUp]);

    const lastIssue = billingState?.autoTopUp.lastIssue ?? null;
    const billingReady = paymentMethodReady && billingDetailsReady;
    const showSliderAndSave = showConfig && billingReady;
    const statusMessage = renderStatusMessage(
        toggleStatus,
        lastIssue,
        billingReady,
    );
    const switchStatus: SwitchStatus = mapToggleStatusToSwitchStatus(
        toggleStatus,
        lastIssue,
    );
    const alertTone = switchStatus === "invalid";
    const isToggleOn = toggleStatus !== "off";

    return (
        <div className="space-y-4">
            <div className="flex min-w-0 items-center gap-3">
                <Switch
                    checked={isToggleOn}
                    onChange={handleToggle}
                    status={switchStatus}
                    disabled={isSaving}
                    ariaLabel={
                        isToggleOn
                            ? "Turn off auto top-up"
                            : "Enable auto top-up"
                    }
                />
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center text-sm font-bold text-theme-text-soft">
                        Auto top-up
                        <InfoTip
                            content={<AutoTopUpTooltipContent />}
                            label="Auto top-up information"
                        />
                    </div>
                    <div
                        className={cn(
                            "text-xs font-medium",
                            alertTone
                                ? "text-intent-danger-text"
                                : "text-theme-text-muted",
                        )}
                    >
                        {statusMessage}
                    </div>
                </div>
            </div>

            {showConfig && (
                <div className="space-y-4">
                    {showSliderAndSave && (
                        <div className="flex flex-col items-start gap-4 pb-10 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                            <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                                <PollenPackSlider
                                    value={packAmountUsd}
                                    onChange={setPackAmountUsd}
                                    packs={AUTO_TOP_UP_PACKS}
                                    selectedBadgeLabel={chargeLabel}
                                    selectedBadgeTooltip={
                                        selectedPack ? (
                                            <AutoTopUpCostTooltip
                                                packAmountUsd={
                                                    selectedPack.amountUsd
                                                }
                                                serviceFeeCents={
                                                    serviceFeeCents
                                                }
                                                subtotalBeforeTaxCents={
                                                    subtotalBeforeTaxCents
                                                }
                                            />
                                        ) : undefined
                                    }
                                    disabled={isSaving}
                                />
                            </div>
                            <AutoTopUpSaveButton
                                showConfig={showConfig}
                                hasUnsavedChanges={hasUnsavedChanges}
                                setup={setup}
                                onSave={handleSave}
                            />
                        </div>
                    )}

                    <div className="flex items-end justify-between gap-3">
                        <SetupSnippet
                            title="Payment method"
                            value={formatPaymentMethod(billingState)}
                        />
                        <ManageBillingButton
                            onClick={openBillingPortal}
                            loading={isOpeningPortal}
                        />
                    </div>
                </div>
            )}

            {error && <ErrorNotice>{error}</ErrorNotice>}
        </div>
    );
};

function renderStatusMessage(
    status: ToggleStatus,
    issue: AutoTopUpIssue | null,
    billingReady: boolean,
): ReactNode {
    if (status === "off") return "Off";
    if (status === "draft") {
        return billingReady
            ? "Choose amount, then click Save to enable"
            : "Add your payment method";
    }
    if (issue?.kind === "pending_payment") {
        return (
            <>
                Further steps required in Stripe —{" "}
                <a
                    href={issue.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-2 hover:text-theme-text-soft"
                >
                    complete in Stripe
                </a>
            </>
        );
    }
    if (issue?.kind === "failed") return "Last charge failed — update card";
    return "On";
}

const AutoTopUpCostTooltip: FC<{
    packAmountUsd: number;
    serviceFeeCents: number;
    subtotalBeforeTaxCents: number;
}> = ({ packAmountUsd, serviceFeeCents, subtotalBeforeTaxCents }) => (
    <span className="block min-w-36 leading-relaxed text-theme-text-muted">
        <span className="flex justify-between gap-3">
            <span>Pack</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(packAmountUsd * 100)}
            </span>
        </span>
        <span className="flex justify-between gap-3">
            <span>Service fee</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(serviceFeeCents)}
            </span>
        </span>
        <span className="flex justify-between gap-3 border-t border-divider pt-1">
            <span>Before tax</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(subtotalBeforeTaxCents)}
            </span>
        </span>
        <span className="block">Tax applies where required</span>
    </span>
);

type ManageBillingButtonProps = {
    onClick: () => void;
    loading: boolean;
};

const ManageBillingButton: FC<ManageBillingButtonProps> = ({
    onClick,
    loading,
}) => (
    <ExternalLinkButton
        onClick={onClick}
        disabled={loading}
        className="w-fit shrink-0 gap-1.5 whitespace-nowrap shadow-none"
    >
        <span className="inline-flex items-center gap-1.5">
            <CardIcon className="h-4 w-4 shrink-0" />
            <span>{loading ? "Opening..." : "Manage billing"}</span>
        </span>
    </ExternalLinkButton>
);

function mapToggleStatusToSwitchStatus(
    status: ToggleStatus,
    issue: AutoTopUpIssue | null,
): SwitchStatus {
    if (status === "off") return "off";
    if (status === "draft") return "invalid";
    // status === "on": red (invalid) when there's an unresolved issue,
    // green (on) when fully configured.
    return issue !== null ? "invalid" : "on";
}

type AutoTopUpSaveButtonProps = {
    showConfig: boolean;
    hasUnsavedChanges: boolean;
    setup: SetupReadiness;
    onSave: () => void;
};

const AutoTopUpSaveButton: FC<AutoTopUpSaveButtonProps> = ({
    showConfig,
    hasUnsavedChanges,
    setup,
    onSave,
}) => {
    const saveDisabled = !showConfig || !canEnable(setup) || !hasUnsavedChanges;
    const disabledReason = getSaveDisabledReason({
        showConfig,
        hasUnsavedChanges,
        ...setup,
    });

    return (
        <DisabledControlTooltip
            content={saveDisabled ? disabledReason : null}
            className="self-start sm:shrink-0 sm:self-center"
        >
            <Button
                as="button"
                type="button"
                onClick={onSave}
                disabled={saveDisabled}
                className="w-28 min-w-0 gap-1.5 self-start text-center shadow-none sm:self-center"
            >
                <CheckIcon className="h-4 w-4 shrink-0" />
                Save
            </Button>
        </DisabledControlTooltip>
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

function getDisabledReason(setup: SetupReadiness): string | null {
    if (setup.isSaving) return "Saving auto top-up...";
    if (!setup.hasSelectedPack) return "Choose a valid pollen pack first.";
    if (!setup.paymentMethodReady && !setup.billingDetailsReady) {
        return "Add a default payment method and billing details in Stripe before saving changes.";
    }
    if (!setup.paymentMethodReady) {
        return "Add a default payment method in Stripe before saving changes.";
    }
    if (!setup.billingDetailsReady) {
        return "Add billing details in Stripe before saving changes.";
    }
    return null;
}

function getSaveDisabledReason(
    state: SetupReadiness & {
        showConfig: boolean;
        hasUnsavedChanges: boolean;
    },
): string | null {
    const setupReason = getDisabledReason(state);
    if (setupReason) return setupReason;
    if (!state.showConfig) return "Use the switch to enable auto top-up first.";
    if (!state.hasUnsavedChanges) return "No changes to save.";
    return null;
}

type SetupSnippetProps = {
    title: string;
    value: ReactNode;
};

const SetupSnippet: FC<SetupSnippetProps> = ({ title, value }) => (
    <div className="min-w-0 break-words leading-relaxed text-theme-text-soft">
        <span className="text-sm font-bold">{title}:</span>{" "}
        <span className="inline-flex rounded-lg bg-surface-opaque px-2 py-0.5 text-sm font-medium">
            {value}
        </span>
    </div>
);

const ErrorNotice: FC<{ children: ReactNode }> = ({ children }) => (
    <div
        role="alert"
        className="rounded-xl border border-intent-danger-border bg-intent-danger-bg-light p-4 text-sm text-intent-danger-text"
    >
        {children}
    </div>
);

function formatPaymentMethod(billingState: BillingState | null): string {
    if (!billingState) return "Unavailable";
    const { paymentMethod } = billingState;
    if (!paymentMethod.hasDefault) return "None";
    const brand = paymentMethod.brand ?? "Card";
    return paymentMethod.last4 ? `${brand} ****${paymentMethod.last4}` : brand;
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

function isStripeBillingReturn(): boolean {
    return (
        new URLSearchParams(window.location.search).get(
            "stripe_billing_return",
        ) === "true"
    );
}

function readAutoTopUpDraftPackAmount(): number | null {
    try {
        const raw = window.sessionStorage.getItem(
            AUTO_TOP_UP_DRAFT_STORAGE_KEY,
        );
        if (!raw) return null;
        const amount = Number(raw);
        return Number.isFinite(amount) ? amount : null;
    } catch {
        return null;
    }
}

function writeAutoTopUpDraftPackAmount(packAmountUsd: number): void {
    try {
        window.sessionStorage.setItem(
            AUTO_TOP_UP_DRAFT_STORAGE_KEY,
            String(packAmountUsd),
        );
    } catch {
        // Ignore unavailable browser storage; the user can still reselect.
    }
}

function clearAutoTopUpDraft(): void {
    try {
        window.sessionStorage.removeItem(AUTO_TOP_UP_DRAFT_STORAGE_KEY);
    } catch {
        // Ignore unavailable browser storage.
    }
}
