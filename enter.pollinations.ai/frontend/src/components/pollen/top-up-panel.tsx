import {
    InlineLink,
    PlusIcon,
    RefreshIcon,
    TabButton,
    WarningIcon,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
    AUTO_TOP_UP_THRESHOLD_POLLEN,
} from "@shared/billing/auto-top-up.ts";
import {
    formatPollenPackValue,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { StripeCheckoutContact } from "@stripe/stripe-js";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { BillingOverview } from "../../backend-types.ts";
import { openBillingPortal } from "../../lib/billing-portal.ts";
import { type AutoTopUpStatus, autoTopUpStatus } from "./auto-top-up-status.ts";
import { PackCheckoutDialog, preloadStripe } from "./pack-checkout-dialog.tsx";
import { PollenPackButtons } from "./pollen-pack-controls.tsx";

type Tab = "once" | "automatic";

const isAutoTopUpPack = (pack: PollenPack) =>
    pack.amountUsd >= AUTO_TOP_UP_PACK_MIN_USD &&
    pack.amountUsd <= AUTO_TOP_UP_PACK_MAX_USD;

type TopUpPanelProps = {
    initialBilling: BillingOverview | null;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet (and billing) once a purchase is credited. */
    onCredited?: () => void;
    /** Back from Stripe's setup page: show Auto-refill until it is on. */
    setupReturn?: boolean;
};

const SETUP_POLL_MS = 1500;
const SETUP_POLL_TRIES = 10;

/**
 * Top-up in one place: buy a pack now (Buy now) or keep the paid balance
 * topped up (Auto-refill). The packs stay put and the line under them always
 * says what the tab does; anything that needs the buyer sits by the tabs.
 */
export const TopUpPanel: FC<TopUpPanelProps> = ({
    initialBilling,
    returnToTopUp,
    onCredited,
    setupReturn = false,
}) => {
    const [billing, setBilling] = useState(initialBilling);
    const [tab, setTab] = useState<Tab>(setupReturn ? "automatic" : "once");
    const [confirmingSetup, setConfirmingSetup] = useState(
        setupReturn && !initialBilling?.autoTopUp.enabled,
    );
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutPack, setCheckoutPack] = useState<PollenPack>(
        POLLEN_PACKS[0] as PollenPack,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setBilling(initialBilling);
    }, [initialBilling]);

    // Stripe.js is ready by the time a pack is clicked.
    const publishableKey = billing?.publishableKey;
    useEffect(() => {
        if (publishableKey) preloadStripe(publishableKey);
    }, [publishableKey]);

    // The webhook turns automatic top-up on shortly after Stripe's setup page;
    // reload billing until it has.
    useEffect(() => {
        if (!confirmingSetup) return;
        let canceled = false;
        let tries = 0;
        const timer = setInterval(async () => {
            tries += 1;
            const next = await apiClient.stripe.billing
                .$get()
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null);
            if (canceled) return;
            if (next) setBilling(next);
            if (next?.autoTopUp.enabled || tries >= SETUP_POLL_TRIES) {
                clearInterval(timer);
                setConfirmingSetup(false);
            }
        }, SETUP_POLL_MS);
        return () => {
            canceled = true;
            clearInterval(timer);
        };
    }, [confirmingSetup]);

    const checkoutParams = new URLSearchParams();
    if (returnToTopUp) {
        checkoutParams.set("return", "top-up");
        if (returnToTopUp.redirect)
            checkoutParams.set("redirect", returnToTopUp.redirect);
    }
    const status = billing ? autoTopUpStatus(billing) : null;
    const autoReady = Boolean(
        billing?.paymentMethod.hasDefault && billing.billingDetailsComplete,
    );
    // No card yet: a pack opens Stripe's setup page (card check, no charge).
    const needsCard = Boolean(billing && !billing.paymentMethod.hasDefault);
    const setupHref = (pack: PollenPack) =>
        `/api/stripe/auto-top-up/setup/${pack.packKey}${checkoutParams.toString() ? `?${checkoutParams}` : ""}`;

    function openPortal(): void {
        void openBillingPortal(returnToTopUp).then((message) =>
            setError(message || null),
        );
    }

    /** Choosing a tile on Auto-refill saves straight away. */
    async function saveAutoTopUp(
        enabled: boolean,
        packAmountUsd: number,
    ): Promise<void> {
        setSaving(true);
        setError(null);
        try {
            const response = await apiClient.stripe["auto-top-up"].$patch({
                json: { enabled, packAmountUsd },
            });
            const payload = (await response.json().catch(() => ({}))) as
                | BillingOverview
                | { error?: string };
            if (!response.ok || !("autoTopUp" in payload))
                throw new Error(
                    ("error" in payload && payload.error) ||
                        "Couldn’t save automatic top-up.",
                );
            setBilling(payload);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Couldn’t save automatic top-up.",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* No card of its own: the tabs and packs sit on the section. */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                    <TabButton
                        active={tab === "once"}
                        onClick={() => setTab("once")}
                        size="lg"
                    >
                        Buy now
                    </TabButton>
                    <TabButton
                        active={tab === "automatic"}
                        onClick={() => setTab("automatic")}
                        size="lg"
                    >
                        <span className="inline-flex items-center gap-2">
                            Auto-refill
                            {status && <AutomaticValue tab={status.tab} />}
                        </span>
                    </TabButton>
                    {/* Beside the tabs when it fits; below them on a phone. */}
                    <div className="basis-full text-[13px] leading-5 sm:ml-auto sm:basis-auto sm:text-right">
                        <TabNotice
                            tab={tab}
                            confirmingSetup={confirmingSetup}
                            billing={billing}
                            status={status}
                            error={error}
                            onPortal={openPortal}
                        />
                    </div>
                </div>

                {tab === "once" ? (
                    <PollenPackButtons
                        selectedAmount={
                            checkoutOpen ? checkoutPack.amountUsd : undefined
                        }
                        onSelect={(pack) => {
                            setCheckoutPack(pack);
                            setCheckoutOpen(true);
                        }}
                    />
                ) : (
                    <PollenPackButtons
                        selectedAmount={
                            billing?.autoTopUp.enabled
                                ? billing.autoTopUp.packAmountUsd
                                : undefined
                        }
                        isDisabled={(pack) =>
                            !isAutoTopUpPack(pack) ||
                            (!autoReady && !needsCard) ||
                            saving ||
                            confirmingSetup
                        }
                        onSelect={(pack) => {
                            if (needsCard)
                                window.location.href = setupHref(pack);
                            else void saveAutoTopUp(true, pack.amountUsd);
                        }}
                        offTile={{
                            selected: !billing?.autoTopUp.enabled,
                            disabled: !autoReady || saving,
                            onSelect: () => {
                                if (billing?.autoTopUp.enabled)
                                    void saveAutoTopUp(
                                        false,
                                        billing.autoTopUp.packAmountUsd,
                                    );
                            },
                        }}
                        describe={(pollen, price) =>
                            `Top up ${pollen} Pollen (${price}) automatically`
                        }
                    />
                )}

                {/* What the tab does: brighter than the footnotes under it,
                    with its own icon, the same height on both tabs. */}
                <p className="flex min-h-5 items-start gap-1.5 px-1 text-[13px] leading-5 font-medium text-theme-text-soft">
                    {tab === "once" ? (
                        <PlusIcon
                            aria-hidden="true"
                            className="mt-[3px] h-3.5 w-3.5 shrink-0"
                        />
                    ) : (
                        <RefreshIcon
                            aria-hidden="true"
                            className="mt-[3px] h-3.5 w-3.5 shrink-0"
                        />
                    )}
                    <span>
                        {tab === "once"
                            ? "Pick a pack to buy it now."
                            : automaticText(billing)}
                    </span>
                </p>
            </div>

            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={checkoutPack}
                checkoutQuery={checkoutParams.toString()}
                billingAddress={stripeBillingAddress(billing)}
                onCredited={onCredited}
            />
        </div>
    );
};

/**
 * On: a green dot and the refill pack as paid Pollen (the wallet's paid icon
 * and number). Off: "Off". Plus ⚠ when it needs you.
 */
const AutomaticValue: FC<{ tab: AutoTopUpStatus["tab"] }> = ({ tab }) => (
    <span className="inline-flex items-center gap-1 text-sm">
        {tab.on ? (
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                <span className="sr-only">On, {tab.label} paid Pollen</span>
                <span
                    aria-hidden="true"
                    className="mr-0.5 h-2 w-2 rounded-full bg-intent-success-text"
                />
                {/* Both tabs fit one row on a 375px phone without it. */}
                <span className="hidden sm:inline-flex">
                    <WalletKindIcon kind="paid" />
                </span>
                <span aria-hidden="true" className="text-paid-deep">
                    {tab.label}
                </span>
            </span>
        ) : (
            <span className="font-semibold text-theme-text-muted">
                {tab.label}
            </span>
        )}
        {tab.warning && (
            <WarningIcon
                aria-label="Needs attention"
                className="h-4 w-4 text-intent-danger-text"
            />
        )}
    </span>
);

/**
 * What needs the buyer, or a step in progress: an error, a declined or
 * pending top-up (both tabs, the Auto-refill tab shows ⚠), or what automatic
 * top-up still lacks (Auto-refill only). Nothing when all is well.
 */
const TabNotice: FC<{
    tab: Tab;
    confirmingSetup: boolean;
    billing: BillingOverview | null;
    status: AutoTopUpStatus | null;
    error: string | null;
    onPortal: () => void;
}> = ({ tab, confirmingSetup, billing, status, error, onPortal }) => {
    if (error) return <Warning>{error}</Warning>;
    if (tab === "automatic" && confirmingSetup)
        return <p className="text-theme-text-muted">Saving your card…</p>;
    if (status?.text) {
        const { action } = status;
        return (
            <Warning>
                {status.text}
                {action?.kind === "link" && (
                    <>
                        {" · "}
                        <InlineLink href={action.href} external>
                            {action.label}
                        </InlineLink>
                    </>
                )}
                {action?.kind === "portal" && (
                    <>
                        {" · "}
                        <InlineLink
                            as="button"
                            type="button"
                            external
                            onClick={onPortal}
                        >
                            {action.label}
                        </InlineLink>
                    </>
                )}
            </Warning>
        );
    }
    if (tab === "once") return null;
    if (!billing) return <Warning>Couldn’t load automatic top-up</Warning>;
    // Without a card, Stripe's setup page asks for the address too.
    if (billing.paymentMethod.hasDefault && !billing.billingDetailsComplete)
        return (
            <Warning>
                Needs your billing address ·{" "}
                <InlineLink
                    as="button"
                    type="button"
                    external
                    onClick={onPortal}
                >
                    Add on Stripe
                </InlineLink>
            </Warning>
        );
    return null;
};

/** "paid balance": Quest Pollen does not trigger it. */
function automaticText(billing: BillingOverview | null): string {
    const pack = billing?.autoTopUp.enabled
        ? `${formatPollenPackValue(billing.autoTopUp.packAmountUsd)} Pollen`
        : "a pack";
    const threshold =
        billing?.autoTopUp.thresholdPollen ?? AUTO_TOP_UP_THRESHOLD_POLLEN;
    return `Automatically purchase ${pack} every time your paid balance reaches ${threshold} Pollen.`;
}

const Warning: FC<{ children: ReactNode }> = ({ children }) => (
    <p
        role="alert"
        className="inline-flex items-start gap-1.5 text-left text-intent-danger-text"
    >
        <WarningIcon
            aria-hidden="true"
            className="mt-[3px] h-3.5 w-3.5 shrink-0"
        />
        <span>{children}</span>
    </p>
);

/**
 * The customer's Stripe address, in the shape Stripe.js takes it. Empty
 * fields are left out: Stripe.js rejects nulls here.
 */
function stripeBillingAddress(
    billing: BillingOverview | null,
): StripeCheckoutContact | undefined {
    const details = billing?.billingDetails;
    if (!details?.country) return undefined;
    const fields = {
        line1: details.line1,
        line2: details.line2,
        city: details.city,
        postal_code: details.postalCode,
        state: details.state,
    };
    const name = details.company ?? details.name;
    return {
        ...(name && { name }),
        address: {
            country: details.country,
            ...Object.fromEntries(
                Object.entries(fields).filter(([, value]) => value),
            ),
        },
    };
}
