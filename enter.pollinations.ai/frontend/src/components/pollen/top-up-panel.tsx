import {
    Button,
    InlineLink,
    Switch,
    Tooltip,
    WarningIcon,
} from "@pollinations/ui";
import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
    AUTO_TOP_UP_THRESHOLD_POLLEN,
} from "@shared/billing/auto-top-up.ts";
import { POLLEN_PACKS, type PollenPack } from "@shared/pollen-packs.ts";
import { Link } from "@tanstack/react-router";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { BillingOverview } from "../../backend-types.ts";
import {
    autoTopUpStatus,
    hasDefaultPaymentMethod,
} from "./auto-top-up-status.ts";
import {
    hostedCheckoutHref,
    PackCheckoutDialog,
    preloadStripe,
} from "./pack-checkout-dialog.tsx";
import { PollenPackButtons } from "./pollen-pack-controls.tsx";

const isAutoTopUpPack = (pack: PollenPack) =>
    pack.amountUsd >= AUTO_TOP_UP_PACK_MIN_USD &&
    pack.amountUsd <= AUTO_TOP_UP_PACK_MAX_USD;

type TopUpPanelProps = {
    initialBilling: BillingOverview | null;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet (and billing) once a purchase is credited. */
    onCredited?: () => void;
    /** Back from Stripe's setup page: wait for the webhook to enable it. */
    setupReturn?: boolean;
};

const SETUP_POLL_MS = 1500;
const SETUP_POLL_TRIES = 10;

export const TopUpPanel: FC<TopUpPanelProps> = ({
    initialBilling,
    returnToTopUp,
    onCredited,
    setupReturn = false,
}) => {
    const [billing, setBilling] = useState(initialBilling);
    const [chosenPack, setChosenPack] = useState<PollenPack | null>(null);
    const [confirmingSetup, setConfirmingSetup] = useState(
        setupReturn && !initialBilling?.autoTopUp.enabled,
    );
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);

    useEffect(() => {
        setBilling(initialBilling);
    }, [initialBilling]);

    const hasSavedCard = Boolean(
        billing?.paymentMethods.some(
            (method) => method.type === "card" && !method.wallet,
        ),
    );
    const publishableKey = hasSavedCard ? billing?.publishableKey : undefined;
    useEffect(() => {
        if (publishableKey) preloadStripe(publishableKey);
    }, [publishableKey]);

    // Stripe's setup webhook enables auto-refill shortly after the return.
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
    const selectedPack =
        chosenPack ??
        POLLEN_PACKS.find(
            (pack) => pack.amountUsd === billing?.autoTopUp.packAmountUsd,
        ) ??
        POLLEN_PACKS.find((pack) => pack.packKey === "p20") ??
        null;
    const hasDefault = billing ? hasDefaultPaymentMethod(billing) : false;
    const autoReady = hasDefault && Boolean(billing?.billingDetailsComplete);
    const needsCard = Boolean(billing) && !hasDefault;
    const selectedRefillPack =
        selectedPack && isAutoTopUpPack(selectedPack) ? selectedPack : null;
    const packTooSmall = Boolean(
        !billing?.autoTopUp.enabled && selectedPack && !selectedRefillPack,
    );
    const setupHref = (pack: PollenPack) =>
        `/api/stripe/auto-top-up/setup/${pack.packKey}${checkoutParams.toString() ? `?${checkoutParams}` : ""}`;

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

    function startCheckout() {
        if (!selectedPack) return;
        if (!hasSavedCard) {
            window.location.href = hostedCheckoutHref(
                selectedPack.packKey,
                checkoutParams.toString(),
            );
            return;
        }
        setCheckoutOpen(true);
    }

    function changeAutoTopUp(enabled: boolean) {
        if (!billing) return;
        if (enabled) {
            if (!selectedRefillPack) return;
            if (needsCard) window.location.href = setupHref(selectedRefillPack);
            else void saveAutoTopUp(true, selectedRefillPack.amountUsd);
        } else {
            void saveAutoTopUp(false, billing.autoTopUp.packAmountUsd);
        }
    }

    const autoTopUpSwitch = (
        <Switch
            ariaLabel="Auto top-up"
            size="md"
            checked={Boolean(billing?.autoTopUp.enabled)}
            disabled={
                !billing ||
                saving ||
                confirmingSetup ||
                (!billing.autoTopUp.enabled &&
                    (!selectedRefillPack || (!autoReady && !needsCard)))
            }
            className={packTooSmall ? "pointer-events-none" : undefined}
            onChange={changeAutoTopUp}
        />
    );

    return (
        <div className="flex flex-col gap-3">
            <section className="flex flex-col gap-3">
                {/* Both modes in one line: what each does, and when auto
                    top-up buys ("paid": Quest Pollen doesn't trigger it). */}
                <p className="text-sm text-theme-text-muted">
                    Pick a pack to buy it now, or turn on auto top-up to buy it
                    every time your paid balance reaches{" "}
                    {AUTO_TOP_UP_THRESHOLD_POLLEN} Pollen.
                </p>
                <PollenPackButtons
                    packs={POLLEN_PACKS}
                    selectedAmount={selectedPack?.amountUsd}
                    onSelect={setChosenPack}
                />
                <div className="flex w-full flex-wrap items-center justify-between gap-x-5 gap-y-3">
                    <Button
                        intent="commit"
                        size="lg"
                        disabled={!selectedPack}
                        onClick={startCheckout}
                    >
                        Buy now
                    </Button>
                    <div className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-theme-text-strong">
                        {packTooSmall ? (
                            <Tooltip
                                triggerAs="span"
                                tapEnabled
                                ariaLabel="Why auto top-up is unavailable"
                                content="Choose 5 Pollen or more to enable auto top-up."
                            >
                                {autoTopUpSwitch}
                            </Tooltip>
                        ) : (
                            autoTopUpSwitch
                        )}
                        <span>
                            {billing?.autoTopUp.enabled
                                ? "Auto top-up"
                                : "Enable auto top-up"}
                        </span>
                        {billing?.autoTopUp.enabled && (
                            <span className="rounded-lg bg-paid-pale px-2 py-1 font-bold tabular-nums text-paid-deep">
                                {status?.tab.label} Pollen
                            </span>
                        )}
                        {status?.tab.warning && (
                            <WarningIcon
                                aria-label="Needs attention"
                                className="h-4 w-4 text-intent-danger-text"
                            />
                        )}
                    </div>
                </div>
                {confirmingSetup && (
                    <p className="text-sm text-theme-text-muted">
                        Saving your card…
                    </p>
                )}
                {saveFailed && (
                    <p role="alert" className="text-sm text-intent-danger-text">
                        Couldn’t save. Try again.
                    </p>
                )}
                {(status?.text || (hasDefault && !autoReady) || !billing) && (
                    <InlineLink
                        as={Link}
                        to="/pollen"
                        hash="billing"
                        external={false}
                    >
                        Check billing
                    </InlineLink>
                )}
            </section>

            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={selectedPack ?? (POLLEN_PACKS[0] as PollenPack)}
                checkoutQuery={checkoutParams.toString()}
                onCredited={onCredited}
            />
        </div>
    );
};
