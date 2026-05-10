import {
    type FC,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from "react";
import { apiClient } from "@/client/api.ts";
import { POLLEN_PACKS } from "@/pollen-packs.ts";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tag } from "../ui/tag.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

export type AutoTopUpIssue = {
    kind: "failed" | "requires_action";
    reason: string;
    occurredAt: string;
};

export type BillingState = {
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        lastAttemptAt: string | null;
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

const AUTO_TOP_UP_PACK_MIN = 5;
const AUTO_TOP_UP_PACK_MAX = 100;
const DEFAULT_PACK_AMOUNT_USD = 10;
const DIVIDER_CLASS = "border-t border-amber-300/70 pt-4";
const PENDING_ENABLE_STORAGE_KEY = "pollinations:autoTopUpPendingEnable";

function readPendingEnable(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return (
            window.sessionStorage.getItem(PENDING_ENABLE_STORAGE_KEY) === "1"
        );
    } catch {
        return false;
    }
}

function writePendingEnable(value: boolean): void {
    if (typeof window === "undefined") return;
    try {
        if (value) {
            window.sessionStorage.setItem(PENDING_ENABLE_STORAGE_KEY, "1");
        } else {
            window.sessionStorage.removeItem(PENDING_ENABLE_STORAGE_KEY);
        }
    } catch {
        // ignore storage errors (private mode, quota, etc.)
    }
}
const AUTO_TOP_UP_TOOLTIP_CONTENT = (
    <div className="space-y-2">
        <div>
            <strong>Auto top-up</strong> keeps your{" "}
            <strong>paid balance</strong> topped up automatically.
        </div>
        <ul className="list-disc space-y-1 pl-4">
            <li>
                Triggers when your <strong>paid balance</strong> drops to{" "}
                <strong>5 pollen or below</strong>
            </li>
            <li>
                Charges your <strong>default Stripe card</strong> for the pack
                size you select
            </li>
            <li>
                Only your <strong>paid balance</strong> counts — tier pollen is
                not considered
            </li>
        </ul>
    </div>
);
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

type ToggleStatus = "off" | "pending" | "on";

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
    const [pendingEnable, setPendingEnableState] = useState(readPendingEnable);
    const setPendingEnable = useCallback((value: boolean) => {
        writePendingEnable(value);
        setPendingEnableState(value);
    }, []);

    const paymentMethodReady = billingState?.paymentMethod.hasDefault ?? false;
    const billingDetailsReady = billingState?.billingDetailsComplete ?? false;
    const selectedPack = AUTO_TOP_UP_PACKS.find(
        (pack) => pack.amountUsd === packAmountUsd,
    );
    const isEnabled = billingState?.autoTopUp.enabled ?? false;
    const hasUnsavedChanges =
        billingState !== null &&
        packAmountUsd !== billingState.autoTopUp.packAmountUsd;
    const setup: SetupReadiness = {
        paymentMethodReady,
        billingDetailsReady,
        hasSelectedPack: Boolean(selectedPack),
        isSaving,
    };
    const billingReady = canEnable(setup);
    const isPending = pendingEnable && !isEnabled && !billingReady;
    const toggleStatus: ToggleStatus = isEnabled
        ? "on"
        : isPending
          ? "pending"
          : "off";

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

    const saveAutoTopUp = useCallback(
        async (enabled: boolean): Promise<void> => {
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
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to save auto top-up",
                );
            } finally {
                setIsSaving(false);
            }
        },
        [packAmountUsd],
    );

    useEffect(() => {
        if (pendingEnable && !isEnabled && billingReady && !isSaving) {
            setPendingEnable(false);
            void saveAutoTopUp(true);
        }
    }, [
        pendingEnable,
        isEnabled,
        billingReady,
        isSaving,
        saveAutoTopUp,
        setPendingEnable,
    ]);

    const handleToggle = useCallback(
        (next: boolean) => {
            if (next) {
                if (billingReady) {
                    void saveAutoTopUp(true);
                } else {
                    setPendingEnable(true);
                }
            } else {
                setPendingEnable(false);
                if (isEnabled) void saveAutoTopUp(false);
            }
        },
        [billingReady, isEnabled, saveAutoTopUp, setPendingEnable],
    );

    const lastIssue = billingState?.autoTopUp.lastIssue ?? null;
    const issueNotice = lastIssue ? (
        <AutoTopUpIssueNotice issue={lastIssue} />
    ) : null;

    return (
        <div className="space-y-4">
            <AutoTopUpToggle
                status={toggleStatus}
                disabled={isSaving}
                onToggle={handleToggle}
            />

            {toggleStatus === "pending" && (
                <Card
                    bg="bg-white/80"
                    className="!border-transparent space-y-4"
                >
                    <BillingSetup
                        paymentMethodReady={paymentMethodReady}
                        paymentMethodValue={formatPaymentMethod(billingState)}
                        billingDetailsReady={billingDetailsReady}
                        billingDetailsValue={formatBillingDetails(billingState)}
                    />
                    <ManageBillingButton
                        onClick={openBillingPortal}
                        loading={isOpeningPortal}
                    />
                    {issueNotice}
                </Card>
            )}

            {toggleStatus === "on" && (
                <Card
                    bg="bg-white/80"
                    className="!border-transparent space-y-4"
                >
                    <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:gap-4 sm:pb-12">
                        <div className="w-full min-w-0 flex-1 pb-10 sm:pb-0">
                            <PollenPackSlider
                                value={packAmountUsd}
                                onChange={setPackAmountUsd}
                                packs={AUTO_TOP_UP_PACKS}
                                disabled={isSaving}
                            />
                        </div>
                        <AutoTopUpSaveButton
                            isEnabled={isEnabled}
                            hasUnsavedChanges={hasUnsavedChanges}
                            setup={setup}
                            onSave={() => saveAutoTopUp(true)}
                        />
                    </div>

                    <div className={cn(DIVIDER_CLASS, "space-y-4")}>
                        <BillingSetup
                            paymentMethodReady={paymentMethodReady}
                            paymentMethodValue={formatPaymentMethod(
                                billingState,
                            )}
                            billingDetailsReady={billingDetailsReady}
                            billingDetailsValue={formatBillingDetails(
                                billingState,
                            )}
                        />
                        <ManageBillingButton
                            onClick={openBillingPortal}
                            loading={isOpeningPortal}
                        />
                        {issueNotice}
                    </div>
                </Card>
            )}

            {error && <ErrorNotice>{error}</ErrorNotice>}
        </div>
    );
};

type ManageBillingButtonProps = {
    onClick: () => void;
    loading: boolean;
};

const ManageBillingButton: FC<ManageBillingButtonProps> = ({
    onClick,
    loading,
}) => (
    <Button
        as="button"
        type="button"
        color="amber"
        weight="light"
        onClick={onClick}
        disabled={loading}
        className="btn-shimmer w-fit max-w-full min-w-0 gap-2 whitespace-nowrap border border-amber-300/70 text-center shadow-none"
    >
        <span>{loading ? "Opening Stripe..." : "Manage billing details"}</span>
        {!loading && <ExternalLinkIcon />}
    </Button>
);

type AutoTopUpToggleProps = {
    status: ToggleStatus;
    disabled: boolean;
    onToggle: (enabled: boolean) => void;
};

const TOGGLE_STATUS_LABEL: Record<ToggleStatus, string> = {
    off: "Off",
    pending: "Active — add billing details to start charging",
    on: "On",
};

const TOGGLE_TRACK_CLASS: Record<ToggleStatus, string> = {
    off: "bg-amber-100 border-amber-300",
    pending: "bg-amber-300 border-amber-400",
    on: "bg-emerald-300 border-emerald-400",
};

const AutoTopUpToggle: FC<AutoTopUpToggleProps> = ({
    status,
    disabled,
    onToggle,
}) => {
    const isOn = status !== "off";
    return (
        <div className="flex min-w-0 items-center gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={
                    isOn ? "Turn off auto top-up" : "Enable auto top-up"
                }
                onClick={() => onToggle(!isOn)}
                disabled={disabled}
                className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60",
                    TOGGLE_TRACK_CLASS[status],
                )}
            >
                <span
                    className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        isOn ? "translate-x-6" : "translate-x-1",
                    )}
                />
            </button>
            <div className="min-w-0">
                <div className="flex min-w-0 items-center text-[15px] font-bold text-amber-950">
                    Auto top-up
                    <InfoTip
                        content={AUTO_TOP_UP_TOOLTIP_CONTENT}
                        label="Auto top-up information"
                        tone="amber"
                    />
                </div>
                <div
                    className={cn(
                        "text-xs font-medium",
                        status === "pending"
                            ? "text-amber-700"
                            : "text-amber-800/75",
                    )}
                >
                    {TOGGLE_STATUS_LABEL[status]}
                </div>
            </div>
        </div>
    );
};

type AutoTopUpSaveButtonProps = {
    isEnabled: boolean;
    hasUnsavedChanges: boolean;
    setup: SetupReadiness;
    onSave: () => void;
};

const AutoTopUpSaveButton: FC<AutoTopUpSaveButtonProps> = ({
    isEnabled,
    hasUnsavedChanges,
    setup,
    onSave,
}) => {
    const saveDisabled = !isEnabled || !canEnable(setup) || !hasUnsavedChanges;
    const disabledReason = getSaveDisabledReason({
        isEnabled,
        hasUnsavedChanges,
        ...setup,
    });

    return (
        <DisabledControlTooltip
            content={saveDisabled ? disabledReason : null}
            className="sm:shrink-0"
        >
            <Button
                as="button"
                type="button"
                color="amber"
                weight="light"
                onClick={onSave}
                disabled={saveDisabled}
                className="btn-shimmer w-28 min-w-0 self-start border border-amber-300/70 text-center shadow-none sm:self-center"
            >
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
};

const BillingSetup: FC<BillingSetupProps> = ({
    paymentMethodReady,
    paymentMethodValue,
    billingDetailsReady,
    billingDetailsValue,
}) => (
    <div className="grid gap-3 md:grid-cols-2">
        <SetupSnippet
            title="Billing address"
            ready={billingDetailsReady}
            value={billingDetailsValue}
        />
        <SetupSnippet
            title="Payment method"
            ready={paymentMethodReady}
            value={paymentMethodValue}
        />
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

type AutoTopUpIssueNoticeProps = {
    issue: AutoTopUpIssue;
};

const AutoTopUpIssueNotice: FC<AutoTopUpIssueNoticeProps> = ({ issue }) => {
    const isAuth = issue.kind === "requires_action";
    const title = isAuth
        ? "Authentication required for auto top-up"
        : "Last auto top-up charge failed";
    const body = isAuth
        ? "Your bank asked you to confirm the last charge. Update your payment method or buy a pack manually to refresh authorization."
        : "We couldn't charge your default payment method. Update it to keep auto top-up working.";
    const occurredLabel = formatRelativeTime(issue.occurredAt);
    return (
        <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700/90"
        >
            <div className="font-semibold">⚠ {title}</div>
            <div className="mt-0.5">{body}</div>
            {occurredLabel && (
                <div className="mt-1 text-[11px] text-red-700/70">
                    Last attempt: {occurredLabel}
                </div>
            )}
        </div>
    );
};

function formatRelativeTime(iso: string): string | null {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSeconds < 60) return "moments ago";
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60)
        return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24)
        return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

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
