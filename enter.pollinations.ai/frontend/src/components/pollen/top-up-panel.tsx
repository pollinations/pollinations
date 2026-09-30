import {
    Button,
    cn,
    InlineLink,
    Switch,
    Tooltip,
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
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { BillingOverview } from "../../backend-types.ts";
import { openBillingPortal } from "../../lib/billing-portal.ts";
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

const buyLabel = (pack: PollenPack | null) =>
    pack ? `Buy ${formatPollenPackValue(pack.amountUsd)} pollen` : "Buy now";
// The second line under "Auto top-up": the pack, or what it needs.
const refillLabel = (amountUsd: number | null) =>
    amountUsd
        ? `${formatPollenPackValue(amountUsd)} pollen`
        : `From ${formatPollenPackValue(AUTO_TOP_UP_PACK_MIN_USD)} pollen`;
// Every text each label can show, so it keeps the widest one's size.
const BUY_LABELS = [null, ...POLLEN_PACKS].map(buyLabel);
const REFILL_LABELS = [
    null,
    ...POLLEN_PACKS.filter(isAutoTopUpPack).map((pack) => pack.amountUsd),
].map(refillLabel);

/**
 * Text that changes without moving anything: every option is stacked in one
 * grid cell, the unused ones invisible, so the widest sets the size.
 */
const StableLabel: FC<{
    text: string;
    options: readonly string[];
    align?: "center" | "end";
    /** Drawn before the text in every option, so it stays beside it. */
    prefix?: ReactNode;
}> = ({ text, options, align = "center", prefix }) => (
    <span
        className={cn(
            "inline-grid",
            align === "center" ? "justify-items-center" : "justify-items-end",
        )}
    >
        {options.map((option) => (
            <span
                key={option}
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 inline-flex items-center gap-1"
            >
                {prefix}
                {option}
            </span>
        ))}
        <span className="col-start-1 row-start-1 inline-flex items-center gap-1">
            {prefix}
            {text}
        </span>
    </span>
);

/**
 * One of several contents in a fixed slot: all stacked in one grid cell, only
 * `active` shown, so the widest sets the size and switching moves nothing.
 * Hidden ones are `invisible`, which also takes their links out of tab order.
 */
const StableSlot: FC<{
    active: string;
    items: Record<string, ReactNode>;
}> = ({ active, items }) => (
    <span className="inline-grid justify-items-end">
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
    // Missing a card or billing details: Stripe's setup page asks for both,
    // then turns auto top-up on. Otherwise the switch saves at once.
    const needsSetup =
        Boolean(billing) && !(hasDefault && billing?.billingDetailsComplete);
    const selectedRefillPack =
        selectedPack && isAutoTopUpPack(selectedPack) ? selectedPack : null;
    const packTooSmall = Boolean(
        !billing?.autoTopUp.enabled && selectedPack && !selectedRefillPack,
    );
    // The one status the row shows under "Auto top-up".
    // Every problem that stops auto top-up, with its fix; Billing only
    // badges the card or address concerned.
    const refillStatus = slotError
        ? "failed"
        : confirmingSetup
          ? "saving"
          : status?.text
            ? "issue"
            : "pack";

    function openPortal(): void {
        setSlotError(null);
        void openBillingPortal(returnToTopUp).then((message) => {
            if (message) setSlotError(PORTAL_FAILED);
        });
    }
    const setupHref = (pack: PollenPack) =>
        `/api/stripe/auto-top-up/setup/${pack.packKey}${checkoutParams.toString() ? `?${checkoutParams}` : ""}`;

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
            if (needsSetup)
                window.location.href = setupHref(selectedRefillPack);
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
            disabled={
                !billing ||
                saving ||
                confirmingSetup ||
                (!billing.autoTopUp.enabled && !selectedRefillPack)
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
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-3">
                    <Button
                        intent="commit"
                        size="lg"
                        disabled={!selectedPack}
                        onClick={startCheckout}
                    >
                        <span className="font-bold">
                            <StableLabel
                                text={buyLabel(selectedPack)}
                                options={BUY_LABELS}
                            />
                        </span>
                    </Button>
                    {/* A settings row: the label, then the switch flush with
                        the grid's right edge. The second line is the one
                        status slot (pack, problem, saving), sized for its
                        widest content, so the switch never moves. */}
                    <div className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-theme-text-strong">
                        <span className="flex flex-col items-end leading-tight">
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
                                                <WarningIcon
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 text-intent-danger-text"
                                                />
                                                {/* The icon says something is
                                                    wrong, the link what to do;
                                                    the problem is read aloud. */}
                                                <span className="sr-only">
                                                    {status?.text}:
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
                                                        onClick={openPortal}
                                                    >
                                                        {status?.action
                                                            ?.label ??
                                                            "Update card"}
                                                    </InlineLink>
                                                )}
                                            </>
                                        ),
                                        saving: (
                                            <span className="text-theme-text-muted">
                                                Saving…
                                            </span>
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
                onCredited={onCredited}
            />
        </div>
    );
};
