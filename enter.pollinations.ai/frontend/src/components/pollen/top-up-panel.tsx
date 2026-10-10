import {
    Button,
    CardIcon,
    cn,
    InlineLink,
    StableLabel,
    Switch,
    Tooltip,
    WarningIcon,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
} from "@shared/billing/auto-top-up.ts";
import {
    formatPollenPackValue,
    getPollenPackByKey,
    POLLEN_PACKS,
    type PollenPack,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { BillingOverview } from "../../backend-types.ts";
import {
    type BillingPortalFlow,
    openBillingPortal,
} from "../../lib/billing-portal.ts";
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
    /**
     * Reload the wallet and billing after anything here changed them (a
     * credited purchase, a saved setting, a finished card setup), so
     * Billing never shows an older state than Top-up.
     */
    onWalletChange?: () => void;
    /** The pack a link or Stripe's return asked for, selected first. */
    initialPack?: PollenPackKey;
};

// The second line under "Auto top-up": the pack, or what it needs.
const refillLabel = (amountUsd: number | null) =>
    amountUsd
        ? `${formatPollenPackValue(amountUsd)} pollen`
        : `From ${formatPollenPackValue(AUTO_TOP_UP_PACK_MIN_USD)} pollen`;
// Every text each label can show, so it keeps the widest one's size.
const REFILL_LABELS = [
    null,
    ...POLLEN_PACKS.filter(isAutoTopUpPack).map((pack) => pack.amountUsd),
].map(refillLabel);
const buyLabel = (amountUsd: number | undefined) =>
    amountUsd ? `Buy ${formatPollenPackValue(amountUsd)} pollen` : "Buy pollen";
const BUY_LABELS = [
    undefined,
    ...POLLEN_PACKS.map((pack) => pack.amountUsd),
].map(buyLabel);

/**
 * One of several contents in a fixed slot: all stacked in one grid cell, only
 * `active` shown, so the widest sets the size and switching moves nothing.
 * Hidden ones are `invisible`, which also takes their links out of tab order.
 */
const StableSlot: FC<{
    active: string;
    items: Record<string, ReactNode>;
}> = ({ active, items }) => (
    <span className="inline-grid justify-items-start sm:justify-items-end">
        {Object.entries(items).map(([key, node]) => (
            <span
                key={key}
                aria-hidden={key === active ? undefined : true}
                className={cn(
                    "col-start-1 row-start-1 inline-flex items-center gap-1",
                    key !== active && "invisible",
                )}
            >
                {node}
            </span>
        ))}
    </span>
);

const SAVE_FAILED = "Couldn’t save";
const PORTAL_FAILED = "Stripe error";

export const TopUpPanel: FC<TopUpPanelProps> = ({
    initialBilling,
    returnToTopUp,
    onWalletChange,
    initialPack,
}) => {
    const [billing, setBilling] = useState(initialBilling);
    const [chosenPack, setChosenPack] = useState<PollenPack | null>(
        () => (initialPack && getPollenPackByKey(initialPack)) || null,
    );
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    // A save or Stripe-portal failure, shown in the status slot.
    const [slotError, setSlotError] = useState<string | null>(null);

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

    const checkoutParams = new URLSearchParams();
    if (returnToTopUp) {
        checkoutParams.set("return", "top-up");
        if (returnToTopUp.redirect)
            checkoutParams.set("redirect", returnToTopUp.redirect);
    }
    const cryptoCheckoutParams = new URLSearchParams(checkoutParams);
    cryptoCheckoutParams.set("payment_method", "crypto");
    const status = billing ? autoTopUpStatus(billing) : null;
    const selectedPack =
        chosenPack ??
        POLLEN_PACKS.find(
            (pack) => pack.amountUsd === billing?.autoTopUp.packAmountUsd,
        ) ??
        POLLEN_PACKS.find((pack) => pack.packKey === "p20") ??
        null;
    const hasDefault = billing ? hasDefaultPaymentMethod(billing) : false;
    // Auto top-up charges the default card and taxes by the billing
    // address. Missing either, the switch first opens Stripe for it (adding
    // a card, or the portal where the details are); back here the buyer
    // turns it on themselves.
    const needsCard = Boolean(billing) && !hasDefault;
    const needsDetails =
        Boolean(billing) && hasDefault && !billing?.billingDetailsComplete;
    const selectedRefillPack =
        selectedPack && isAutoTopUpPack(selectedPack) ? selectedPack : null;
    const packTooSmall = Boolean(
        !billing?.autoTopUp.enabled && selectedPack && !selectedRefillPack,
    );
    // The one status the row shows under "Auto top-up".
    // Every problem that stops auto top-up, with its fix; Billing only
    // badges the card or address concerned.
    const refillStatus = slotError ? "failed" : status?.text ? "issue" : "pack";

    function openPortal(flow?: BillingPortalFlow): void {
        setSlotError(null);
        void openBillingPortal(returnToTopUp, flow, selectedPack?.packKey).then(
            (message) => {
                if (message) setSlotError(PORTAL_FAILED);
            },
        );
    }

    async function saveAutoTopUp(
        enabled: boolean,
        packAmountUsd: number,
    ): Promise<void> {
        setSaving(true);
        setSlotError(null);
        try {
            const response = await apiClient.stripe["auto-top-up"].$patch({
                json: { enabled, packAmountUsd },
            });
            const payload = (await response.json().catch(() => ({}))) as
                | BillingOverview
                | { error?: string };
            if (!response.ok || !("autoTopUp" in payload)) throw new Error();
            setBilling(payload);
            onWalletChange?.();
        } catch {
            setSlotError(SAVE_FAILED);
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
            if (needsCard) openPortal("card");
            else if (needsDetails) openPortal();
            else void saveAutoTopUp(true, selectedRefillPack.amountUsd);
        } else {
            void saveAutoTopUp(false, billing.autoTopUp.packAmountUsd);
        }
    }

    const autoTopUpSwitch = (
        <Switch
            ariaLabel={
                billing?.autoTopUp.enabled
                    ? `Auto top-up, ${status?.tab.label} Pollen`
                    : "Auto top-up"
            }
            size="md"
            checked={Boolean(billing?.autoTopUp.enabled)}
            // On but stuck: the bank is waiting for the buyer to approve.
            status={
                billing?.autoTopUp.enabled &&
                billing.autoTopUp.lastIssue?.kind === "pending_payment"
                    ? "invalid"
                    : undefined
            }
            disabled={
                !billing ||
                saving ||
                (!billing.autoTopUp.enabled && !selectedRefillPack)
            }
            className={packTooSmall ? "pointer-events-none" : undefined}
            onChange={changeAutoTopUp}
        />
    );

    return (
        <div className="flex flex-col gap-3">
            <section className="flex flex-col gap-3">
                <PollenPackButtons
                    packs={POLLEN_PACKS}
                    selectedAmount={selectedPack?.amountUsd}
                    onSelect={setChosenPack}
                />
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-3">
                    {/* Both choices open checkout for the selected pack. */}
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
                        <Button
                            size="lg"
                            intent="brand"
                            className="shrink-0 whitespace-nowrap"
                            icon={<CardIcon />}
                            disabled={!selectedPack}
                            onClick={startCheckout}
                        >
                            <StableLabel
                                text={buyLabel(selectedPack?.amountUsd)}
                                options={BUY_LABELS}
                            />
                        </Button>
                        {selectedPack && (
                            <Tooltip
                                triggerAs="span"
                                content="Secure payment via Stripe"
                                className="shrink-0"
                            >
                                <InlineLink
                                    href={hostedCheckoutHref(
                                        selectedPack.packKey,
                                        cryptoCheckoutParams.toString(),
                                    )}
                                    external
                                    target="_self"
                                    size="sm"
                                    className="inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                                >
                                    Pay with Crypto
                                </InlineLink>
                            </Tooltip>
                        )}
                    </div>
                    {/* The switch leads on mobile; desktop keeps it after
                        the label. The second line is the one
                        status slot (pack, problem, saving), sized for its
                        widest content, so the switch never moves. */}
                    <div className="inline-flex flex-row-reverse items-center gap-2 text-sm font-semibold text-theme-text-strong sm:flex-row">
                        <span className="flex flex-col items-start leading-tight sm:items-end">
                            <span>Auto top-up</span>
                            {/* It buys paid Pollen: the Paid card's icon and
                                colour while on, greyed while off. Same weight
                                and icon both ways, so nothing moves. */}
                            <span className="text-xs font-semibold tabular-nums">
                                <StableSlot
                                    active={refillStatus}
                                    items={{
                                        issue: (
                                            <>
                                                {/* The icon says something is
                                                    wrong, the link what to do;
                                                    the problem is read aloud.
                                                    When the short text can't
                                                    say what it means (off, but
                                                    a payment still waits), the
                                                    icon explains on hover or
                                                    tap. */}
                                                {status?.detail ? (
                                                    <Tooltip
                                                        triggerAs="span"
                                                        tapEnabled
                                                        ariaLabel="What this means"
                                                        content={status.detail}
                                                    >
                                                        <WarningIcon
                                                            aria-hidden="true"
                                                            className="h-3.5 w-3.5 text-intent-danger-text"
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <WarningIcon
                                                        aria-hidden="true"
                                                        className="h-3.5 w-3.5 text-intent-danger-text"
                                                    />
                                                )}
                                                <span className="sr-only">
                                                    {status?.detail ??
                                                        `${status?.text}:`}
                                                </span>
                                                {status?.action?.kind ===
                                                "link" ? (
                                                    <InlineLink
                                                        href={
                                                            status.action.href
                                                        }
                                                    >
                                                        {status.action.label}
                                                    </InlineLink>
                                                ) : (
                                                    <InlineLink
                                                        as="button"
                                                        type="button"
                                                        // Portal home: pick another saved card or add one.
                                                        onClick={() =>
                                                            openPortal()
                                                        }
                                                    >
                                                        {status?.action
                                                            ?.label ??
                                                            "Update card"}
                                                    </InlineLink>
                                                )}
                                            </>
                                        ),
                                        failed: (
                                            <span
                                                role="alert"
                                                className="inline-flex items-center gap-1 text-intent-danger-text"
                                            >
                                                <WarningIcon
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />
                                                <StableLabel
                                                    text={
                                                        slotError ?? SAVE_FAILED
                                                    }
                                                    options={[
                                                        SAVE_FAILED,
                                                        PORTAL_FAILED,
                                                    ]}
                                                    align="end"
                                                />
                                            </span>
                                        ),
                                        pack: (
                                            <span
                                                className={cn(
                                                    "transition-colors",
                                                    billing?.autoTopUp.enabled
                                                        ? "text-paid-deep"
                                                        : "text-theme-text-muted",
                                                )}
                                            >
                                                <StableLabel
                                                    prefix={
                                                        <span
                                                            className={cn(
                                                                "inline-flex",
                                                                !billing
                                                                    ?.autoTopUp
                                                                    .enabled &&
                                                                    "opacity-60 grayscale",
                                                            )}
                                                        >
                                                            <WalletKindIcon kind="paid" />
                                                        </span>
                                                    }
                                                    text={refillLabel(
                                                        billing?.autoTopUp
                                                            .enabled
                                                            ? billing.autoTopUp
                                                                  .packAmountUsd
                                                            : (selectedRefillPack?.amountUsd ??
                                                                  null),
                                                    )}
                                                    options={REFILL_LABELS}
                                                    align="end"
                                                />
                                            </span>
                                        ),
                                    }}
                                />
                            </span>
                        </span>
                        {packTooSmall ? (
                            <Tooltip
                                triggerAs="span"
                                tapEnabled
                                // No inline wrapper: the switch stays put.
                                displayContents
                                ariaLabel="Why auto top-up is unavailable"
                                content="Choose 5 Pollen or more to enable auto top-up."
                            >
                                {autoTopUpSwitch}
                            </Tooltip>
                        ) : (
                            autoTopUpSwitch
                        )}
                    </div>
                </div>
            </section>

            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={selectedPack ?? (POLLEN_PACKS[0] as PollenPack)}
                checkoutQuery={checkoutParams.toString()}
                onCredited={onWalletChange}
                onCompleteDetails={() =>
                    openBillingPortal(
                        returnToTopUp,
                        undefined,
                        selectedPack?.packKey,
                    )
                }
            />
        </div>
    );
};
