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
import { Link } from "@tanstack/react-router";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { BillingOverview } from "../../backend-types.ts";
import {
    type AutoTopUpStatus,
    autoTopUpStatus,
    hasDefaultPaymentMethod,
} from "./auto-top-up-status.ts";
import {
    hostedCheckoutHref,
    PackCheckoutDialog,
    preloadStripe,
} from "./pack-checkout-dialog.tsx";
import { PollenPackButtons } from "./pollen-pack-controls.tsx";

type Tab = "buy" | "refill";

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
    const [tab, setTab] = useState<Tab>(setupReturn ? "refill" : "buy");
    const [confirmingSetup, setConfirmingSetup] = useState(
        setupReturn && !initialBilling?.autoTopUp.enabled,
    );
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutPack, setCheckoutPack] = useState<PollenPack>(
        POLLEN_PACKS[0] as PollenPack,
    );
    const [saving, setSaving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);

    useEffect(() => {
        setBilling(initialBilling);
    }, [initialBilling]);

    // A saved card pays in our modal; without one, Buy now goes straight to
    // Stripe's page, which has every method (Apple Pay, PayPal, …).
    const hasSavedCard = Boolean(
        billing?.paymentMethods.some((method) => method.type === "card"),
    );
    // Stripe.js is ready by the time a pack is clicked.
    const publishableKey = hasSavedCard ? billing?.publishableKey : undefined;
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
    const hasDefault = billing ? hasDefaultPaymentMethod(billing) : false;
    const autoReady = hasDefault && Boolean(billing?.billingDetailsComplete);
    // No card yet: a pack opens Stripe's setup page (card check, no charge).
    const needsCard = Boolean(billing) && !hasDefault;
    const setupHref = (pack: PollenPack) =>
        `/api/stripe/auto-top-up/setup/${pack.packKey}${checkoutParams.toString() ? `?${checkoutParams}` : ""}`;

    /** Choosing a tile on Auto-refill saves straight away. */
    async function saveAutoTopUp(
        enabled: boolean,
        packAmountUsd: number,
    ): Promise<void> {
        setSaving(true);
        setSaveFailed(false);
        try {
            const response = await apiClient.stripe["auto-top-up"].$patch({
                json: { enabled, packAmountUsd },
            });
            const payload = (await response.json().catch(() => ({}))) as
                | BillingOverview
                | { error?: string };
            if (!response.ok || !("autoTopUp" in payload)) throw new Error();
            setBilling(payload);
        } catch {
            setSaveFailed(true);
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
                        active={tab === "buy"}
                        onClick={() => setTab("buy")}
                        size="lg"
                    >
                        Buy now
                    </TabButton>
                    <TabButton
                        active={tab === "refill"}
                        onClick={() => setTab("refill")}
                        size="lg"
                    >
                        <span className="inline-flex items-center gap-2">
                            Auto-refill
                            {status && <RefillValue tab={status.tab} />}
                        </span>
                    </TabButton>
                    {/* Right after the tabs; wraps under them if no room. */}
                    <div className="text-sm">
                        <TabNotice
                            tab={tab}
                            confirmingSetup={confirmingSetup}
                            billing={billing}
                            status={status}
                            saveFailed={saveFailed}
                        />
                    </div>
                </div>

                {/* What the tab does, read before picking: brighter than the
                    footnotes, with its own icon. */}
                <p className="flex min-h-5 items-start gap-1.5 px-1 text-[13px] leading-5 font-medium text-theme-text-soft">
                    {tab === "buy" ? (
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
                        {tab === "buy"
                            ? "Pick a pack to buy it now."
                            : refillText(billing)}
                    </span>
                </p>

                {tab === "buy" ? (
                    <PollenPackButtons
                        selectedAmount={
                            checkoutOpen ? checkoutPack.amountUsd : undefined
                        }
                        onSelect={(pack) => {
                            if (!hasSavedCard) {
                                window.location.href = hostedCheckoutHref(
                                    pack.packKey,
                                    checkoutParams.toString(),
                                );
                                return;
                            }
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
            </div>

            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={checkoutPack}
                checkoutQuery={checkoutParams.toString()}
                onCredited={onCredited}
            />
        </div>
    );
};

/**
 * On: a green dot and the refill pack as paid Pollen (the wallet's paid icon
 * and number). Off: "Off". Plus ⚠ when it needs you.
 */
const RefillValue: FC<{ tab: AutoTopUpStatus["tab"] }> = ({ tab }) => (
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
 * One short line by the tabs, always the same: the details and what to do
 * sit in Billing, next to the card or address they concern.
 */
const TabNotice: FC<{
    tab: Tab;
    confirmingSetup: boolean;
    billing: BillingOverview | null;
    status: AutoTopUpStatus | null;
    saveFailed: boolean;
}> = ({ tab, confirmingSetup, billing, status, saveFailed }) => {
    // No icon: the Auto-refill tab carries the ⚠.
    if (saveFailed)
        return (
            <span role="alert" className="text-intent-danger-text">
                Couldn’t save, try again
            </span>
        );
    if (tab === "refill" && confirmingSetup)
        return <span className="text-theme-text-muted">Saving your card…</span>;
    // A declined or pending top-up shows on both tabs; what auto-refill
    // still lacks only on its own.
    const needsBilling =
        Boolean(status?.text) ||
        (tab === "refill" &&
            (!billing ||
                (hasDefaultPaymentMethod(billing) &&
                    !billing.billingDetailsComplete)));
    if (!needsBilling) return null;
    return (
        <InlineLink as={Link} to="/pollen" hash="billing" external={false}>
            Check billing
        </InlineLink>
    );
};

/** "paid balance": Quest Pollen does not trigger it. */
function refillText(billing: BillingOverview | null): string {
    const pack = billing?.autoTopUp.enabled
        ? `${formatPollenPackValue(billing.autoTopUp.packAmountUsd)} Pollen`
        : "a pack";
    return `Automatically purchase ${pack} every time your paid balance reaches ${AUTO_TOP_UP_THRESHOLD_POLLEN} Pollen.`;
}
