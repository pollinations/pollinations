import { InlineLink, Surface, TabButton, WarningIcon } from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
} from "@shared/billing/auto-top-up.ts";
import { POLLEN_PACKS, type PollenPack } from "@shared/pollen-packs.ts";
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
};

/**
 * Top-up in one place: buy a pack now (Once) or keep the paid balance
 * topped up (Automatic). The packs stay put and one footer line holds the
 * only text, so switching tabs moves nothing.
 */
export const TopUpPanel: FC<TopUpPanelProps> = ({
    initialBilling,
    returnToTopUp,
    onCredited,
}) => {
    const [billing, setBilling] = useState(initialBilling);
    const [tab, setTab] = useState<Tab>("once");
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

    function openPortal(): void {
        void openBillingPortal(returnToTopUp).then((message) =>
            setError(message || null),
        );
    }

    /** Choosing a tile on Automatic saves straight away; nothing is charged. */
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
            {/* The tabs sit in the card with the packs they switch. */}
            <Surface className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <TabButton
                        active={tab === "once"}
                        onClick={() => setTab("once")}
                        size="lg"
                    >
                        Once
                    </TabButton>
                    <TabButton
                        active={tab === "automatic"}
                        onClick={() => setTab("automatic")}
                        size="lg"
                    >
                        <span className="inline-flex items-center gap-2">
                            Automatic
                            {status && <AutomaticValue tab={status.tab} />}
                        </span>
                    </TabButton>
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
                            !isAutoTopUpPack(pack) || !autoReady || saving
                        }
                        onSelect={(pack) =>
                            void saveAutoTopUp(true, pack.amountUsd)
                        }
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

                {/* One line of text, the same height on both tabs. */}
                <div className="min-h-5 text-[13px] leading-5">
                    <FooterText
                        tab={tab}
                        billing={billing}
                        status={status}
                        error={error}
                        onPortal={openPortal}
                    />
                </div>
            </Surface>

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
                <WalletKindIcon kind="paid" />
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

/** An error or a problem wins; otherwise the tab's own sentence. */
const FooterText: FC<{
    tab: Tab;
    billing: BillingOverview | null;
    status: AutoTopUpStatus | null;
    error: string | null;
    onPortal: () => void;
}> = ({ tab, billing, status, error, onPortal }) => {
    if (error) return <Warning>{error}</Warning>;
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
    // The card's one line says what happens: what a price includes (Once),
    // and when automatic top-up buys (Automatic).
    // The card's one line says what the packs do; what a price includes is
    // a footnote under the card.
    if (tab === "once")
        return (
            <p className="text-theme-text-muted">Pick a pack to buy it now.</p>
        );
    let text: ReactNode = null;
    if (!billing) text = "Couldn’t load automatic top-up.";
    else if (!billing.paymentMethod.hasDefault)
        text = "Needs a saved card: tick “Save” when you pay";
    else if (!billing.billingDetailsComplete)
        text = (
            <>
                Needs your billing address ·{" "}
                <InlineLink
                    as="button"
                    type="button"
                    external
                    onClick={onPortal}
                >
                    Add on Stripe
                </InlineLink>
            </>
        );
    // Same line on or off: the tab and the ringed tile show the state.
    else
        text = `Pick a pack to add when your paid balance falls to ${billing.autoTopUp.thresholdPollen}.`;
    return <p className="text-theme-text-muted">{text}</p>;
};

const Warning: FC<{ children: ReactNode }> = ({ children }) => (
    <p
        role="alert"
        className="flex items-center gap-1.5 text-intent-danger-text"
    >
        <WarningIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
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
