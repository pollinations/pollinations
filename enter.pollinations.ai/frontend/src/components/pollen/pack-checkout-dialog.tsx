import {
    Button,
    cn,
    Dialog,
    DialogBody,
    ExternalLinkIcon,
    InlineLink,
    LoadingStatus,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import {
    formatPollenPackValue,
    type PollenPack,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import {
    loadStripe,
    type Stripe,
    type StripeCheckoutSession,
} from "@stripe/stripe-js";
import type { FC, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { config } from "../../config.ts";
import { CheckoutConfirmation } from "./checkout-confirmation.tsx";
import { formatCard } from "./payment-method-format.ts";

/** A Checkout Session shown in the pay modal (`ui_mode: custom`). */
type WalletCheckout = {
    clientSecret: string;
    sessionId: string;
    publishableKey: string;
};

type StartResult =
    | { ok: true; checkout: WalletCheckout }
    | { ok: false; message: string; offerHosted: boolean };

/** The open session for one pack, kept while the page lives. */
type SessionSlot = { packKey: PollenPackKey; start: Promise<StartResult> };

/** Stripe's hosted page: every method, for buyers without a saved card. */
export function hostedCheckoutHref(packKey: string, query: string): string {
    return `/api/stripe/checkout/${packKey}${query ? `?${query}` : ""}`;
}

async function startWalletCheckout(
    packKey: PollenPackKey,
    query: string,
): Promise<StartResult> {
    try {
        const response = await fetch(
            `${config.apiBaseUrl}/stripe/checkout/${packKey}/session${query ? `?${query}` : ""}`,
            { method: "POST", credentials: "include" },
        );
        const body = (await response.json().catch(() => null)) as
            | (Partial<WalletCheckout> & { error?: string })
            | null;
        if (response.ok && body?.clientSecret)
            return { ok: true, checkout: body as WalletCheckout };
        // Signed out, banned or an invalid pack: hosted Checkout refuses too.
        if (response.status < 500) {
            return {
                ok: false,
                message: body?.error ?? "Couldn’t start checkout.",
                offerHosted: false,
            };
        }
    } catch {}
    return { ok: false, message: "Couldn’t load checkout.", offerHosted: true };
}

const stripeLoads = new Map<string, Promise<Stripe | null>>();

/** Start loading Stripe.js early; the pay modal reuses the same load. */
export function preloadStripe(publishableKey: string): void {
    void loadStripeOnce(publishableKey);
}

function loadStripeOnce(publishableKey: string): Promise<Stripe | null> {
    let load = stripeLoads.get(publishableKey);
    if (!load) {
        load = loadStripe(publishableKey).catch(() => {
            stripeLoads.delete(publishableKey);
            return null;
        });
        stripeLoads.set(publishableKey, load);
    }
    return load;
}

type PackCheckoutDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pack: PollenPack;
    /** return/redirect for the standalone top-up page, as a query string. */
    checkoutQuery: string;
    onCredited?: () => void;
    /** Open Stripe to add the billing address tax needs; resolves to an error message, "" on success. */
    onCompleteDetails: () => Promise<string>;
};

/**
 * The pay modal for buyers with a saved card: one Confirm, or Stripe's
 * hosted page for another card or method. Two clicks from the pack button;
 * reopening the same pack mounts the same session.
 */
export const PackCheckoutDialog: FC<PackCheckoutDialogProps> = ({
    open,
    onOpenChange,
    pack,
    checkoutQuery,
    onCredited,
    onCompleteDetails,
}) => {
    const slot = useRef<SessionSlot | null>(null);
    const [attempt, setAttempt] = useState(0);

    function sessionFor(packKey: PollenPackKey): Promise<StartResult> {
        if (slot.current?.packKey !== packKey) {
            const start = startWalletCheckout(packKey, checkoutQuery);
            slot.current = { packKey, start };
            // A failed start is not reused: the next open tries again.
            void start.then((result) => {
                if (!result.ok && slot.current?.start === start)
                    slot.current = null;
            });
        }
        return slot.current.start;
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="md"
            title={`Buy ${formatPollenPackValue(pack.amountUsd)} Pollen`}
        >
            {open && (
                <CheckoutBody
                    key={`${pack.packKey}:${attempt}`}
                    hostedHref={hostedCheckoutHref(pack.packKey, checkoutQuery)}
                    start={() => sessionFor(pack.packKey)}
                    onFinished={() => {
                        slot.current = null;
                    }}
                    onRetry={() => {
                        slot.current = null;
                        setAttempt((value) => value + 1);
                    }}
                    onCredited={onCredited}
                    onCompleteDetails={onCompleteDetails}
                    onClose={() => onOpenChange(false)}
                />
            )}
        </Dialog>
    );
};

type BodyState =
    | { phase: "loading" }
    | { phase: "ready"; stripe: Stripe; checkout: WalletCheckout }
    | { phase: "error"; message: string; offerHosted: boolean }
    | { phase: "complete"; sessionId: string };

const LOAD_ERROR = {
    phase: "error",
    message: "Couldn’t load checkout.",
    offerHosted: true,
} as const;

const CheckoutBody: FC<{
    hostedHref: string;
    start: () => Promise<StartResult>;
    onFinished: () => void;
    onRetry: () => void;
    onCredited?: () => void;
    onCompleteDetails: () => Promise<string>;
    onClose: () => void;
}> = ({
    hostedHref,
    start,
    onFinished,
    onRetry,
    onCredited,
    onCompleteDetails,
    onClose,
}) => {
    const [state, setState] = useState<BodyState>({ phase: "loading" });
    // Read once on mount: a new pack or retry remounts this body.
    const startOnMount = useRef(start);

    useEffect(() => {
        let canceled = false;
        (async () => {
            const result = await startOnMount.current();
            if (canceled) return;
            if (!result.ok) return setState({ phase: "error", ...result });
            const stripe = await loadStripeOnce(result.checkout.publishableKey);
            if (canceled) return;
            setState(
                stripe
                    ? { phase: "ready", stripe, checkout: result.checkout }
                    : LOAD_ERROR,
            );
        })().catch(() => {
            if (!canceled) setState(LOAD_ERROR);
        });
        return () => {
            canceled = true;
        };
    }, []);

    switch (state.phase) {
        case "loading":
            return (
                <DialogBody actions={<CloseButton onClick={onClose} />}>
                    <CheckoutLoading />
                </DialogBody>
            );
        case "complete":
            return (
                <DialogBody
                    actions={<CloseButton onClick={onClose} label="Close" />}
                >
                    <CheckoutConfirmation
                        sessionId={state.sessionId}
                        onCredited={onCredited}
                        onRetry={onRetry}
                    />
                </DialogBody>
            );
        case "error":
            return (
                <DialogBody
                    actions={
                        <>
                            <CloseButton onClick={onClose} />
                            {state.offerHosted && (
                                <HostedButton href={hostedHref}>
                                    Pay on Stripe’s page
                                </HostedButton>
                            )}
                        </>
                    }
                >
                    <ErrorLine>{state.message}</ErrorLine>
                </DialogBody>
            );
        case "ready":
            return (
                <WalletPay
                    stripe={state.stripe}
                    checkout={state.checkout}
                    hostedHref={hostedHref}
                    onComplete={(sessionId) => {
                        onFinished();
                        setState({ phase: "complete", sessionId });
                    }}
                    onLoadError={() => setState(LOAD_ERROR)}
                    onCompleteDetails={onCompleteDetails}
                    onClose={onClose}
                />
            );
    }
};

type WalletActions = {
    confirmWithCard: (paymentMethod: string) => Promise<string | null>;
};

/**
 * Our pay screen: the localized total and the saved card with one Confirm
 * (the dialog title names the pack). Stripe still runs the Checkout Session (Adaptive Pricing, tax,
 * 3DS when the bank asks); its currency selector must stay visible next to
 * the price.
 */
const WalletPay: FC<{
    stripe: Stripe;
    checkout: WalletCheckout;
    hostedHref: string;
    onComplete: (sessionId: string) => void;
    onLoadError: () => void;
    onCompleteDetails: () => Promise<string>;
    onClose: () => void;
}> = ({
    stripe,
    checkout,
    hostedHref,
    onComplete,
    onLoadError,
    onCompleteDetails,
    onClose,
}) => {
    const currencySelector = useRef<HTMLDivElement>(null);
    const [session, setSession] = useState<StripeCheckoutSession | null>(null);
    const [actions, setActions] = useState<WalletActions | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Nothing shows until Stripe's currency selector is drawn, so the modal
    // appears complete instead of building itself up.
    const [ready, setReady] = useState(false);
    // Stripe requires its currency selector beside the price whenever it
    // offers the buyer's currency: no Confirm until it is drawn, and Stripe's
    // own page if it never loads.
    const [selector, setSelector] = useState<
        "none" | "loading" | "ready" | "failed"
    >("none");
    const [openingDetails, setOpeningDetails] = useState(false);
    const callbacks = useRef({ onComplete, onLoadError });
    callbacks.current = { onComplete, onLoadError };

    useEffect(() => {
        let canceled = false;
        const cleanups: Array<() => void> = [];
        const show = () => {
            if (!canceled) setReady(true);
        };
        // A ready event that never comes must not hide the payment forever.
        const showAnyway = setTimeout(show, READY_TIMEOUT_MS);
        cleanups.push(() => clearTimeout(showAnyway));
        const elements = stripe.initCheckout({
            clientSecret: checkout.clientSecret,
            adaptivePricing: { allowed: true },
        });
        elements.on("change", (next) => {
            if (!canceled) setSession(next);
        });
        (async () => {
            const loaded = await elements.loadActions();
            if (canceled) return;
            if (loaded.type === "error") return callbacks.current.onLoadError();
            let current = loaded.actions.getSession();
            const saved = current.savedPaymentMethods?.[0];
            // Tax follows the saved card's billing address, as on Stripe's
            // page, so the total shown is the total charged.
            const address = saved?.billingDetails.address;
            if (
                current.tax.status === "requires_billing_address" &&
                address?.country
            ) {
                const updated = await loaded.actions.updateBillingAddress({
                    name: saved?.billingDetails.name,
                    address: { ...address, country: address.country },
                });
                if (canceled) return;
                if (updated.type === "success") current = updated.session;
            }
            setSession(current);
            setActions({
                confirmWithCard: async (paymentMethod) => {
                    const result = await loaded.actions.confirm({
                        paymentMethod,
                        redirect: "if_required",
                    });
                    return result.type === "success"
                        ? null
                        : result.error.message || "Payment didn’t go through.";
                },
            });
            if (current.currencyOptions?.length && currencySelector.current) {
                setSelector("loading");
                const element = elements.createCurrencySelectorElement();
                // Counted from the mount: a selector that never draws must
                // not leave Confirm waiting, so Stripe's page takes over.
                const settle = (state: "ready" | "failed") => {
                    clearTimeout(giveUp);
                    if (canceled) return;
                    // The first outcome stays: a late ready doesn't swap
                    // Stripe's page back to Confirm under the buyer.
                    setSelector((now) => (now === "loading" ? state : now));
                    show();
                };
                const giveUp = setTimeout(
                    () => settle("failed"),
                    READY_TIMEOUT_MS,
                );
                cleanups.push(() => clearTimeout(giveUp));
                element.once("ready", () => settle("ready"));
                element.once("loaderror", () => settle("failed"));
                element.mount(currencySelector.current);
                cleanups.push(() => element.destroy());
            } else show();
        })().catch(() => {
            if (!canceled) callbacks.current.onLoadError();
        });
        return () => {
            canceled = true;
            for (const cleanup of cleanups) cleanup();
        };
    }, [stripe, checkout]);

    const card = session?.savedPaymentMethods?.[0];
    const taxReady = session?.tax.status === "ready";
    const tax = session?.total.taxExclusive;
    // The saved card's address wasn't enough for tax (a US card without a
    // ZIP, say): only the buyer can complete it, on Stripe.
    const needsDetails = session?.tax.status === "requires_billing_address";
    const selectorOk = selector === "none" || selector === "ready";
    // Not session.canConfirm: it waits for a Payment Element, which the
    // saved card replaces.
    const canConfirm = Boolean(card && taxReady && actions && selectorOk);

    async function completeDetails(): Promise<void> {
        setOpeningDetails(true);
        setError(null);
        const failure = await onCompleteDetails();
        if (failure) {
            setError(failure);
            setOpeningDetails(false);
        }
    }

    async function confirmWithCard(): Promise<void> {
        if (!card || !actions) return;
        setSubmitting(true);
        setError(null);
        const failure = await actions.confirmWithCard(card.id);
        if (failure) {
            setError(failure);
            setSubmitting(false);
            return;
        }
        onComplete(checkout.sessionId);
    }

    return (
        <DialogBody
            actions={
                // With a saved card, Confirm is the one action and fills the
                // row; Cancel moves to the quiet line below it. Missing tax
                // details or a selector that never loaded replace it with
                // the way forward.
                ready && card && needsDetails ? (
                    <Button
                        size="lg"
                        icon={<ExternalLinkIcon />}
                        disabled={openingDetails}
                        onClick={() => void completeDetails()}
                        className="w-full"
                    >
                        {openingDetails
                            ? "Opening Stripe…"
                            : "Complete billing details on Stripe"}
                    </Button>
                ) : ready && card && selector === "failed" ? (
                    <HostedButton href={hostedHref}>
                        Pay on Stripe’s page
                    </HostedButton>
                ) : ready && card ? (
                    <Button
                        intent="commit"
                        size="lg"
                        disabled={!canConfirm || submitting}
                        onClick={() => void confirmWithCard()}
                        className="w-full tabular-nums"
                    >
                        {submitting
                            ? "Confirming…"
                            : session
                              ? `Confirm · ${session.total.total.amount}`
                              : "Confirm"}
                    </Button>
                ) : (
                    <>
                        <CloseButton onClick={onClose} disabled={submitting} />
                        {ready && session && (
                            // A card Stripe won't show again: its own page.
                            <HostedButton href={hostedHref}>
                                Pay on Stripe’s page
                            </HostedButton>
                        )}
                    </>
                )
            }
            footnote={
                ready && card ? (
                    <div className="flex items-center justify-between gap-4 px-(--polli-dialog-gutter) pb-6 text-[13px] leading-snug">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="cursor-pointer text-theme-text-muted transition-colors hover:text-theme-text-strong disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <InlineLink href={hostedHref} external>
                            Another card or method
                        </InlineLink>
                    </div>
                ) : undefined
            }
        >
            <div className="relative min-h-40">
                {!ready && <CheckoutLoading overlay />}
                <div
                    className={cn("flex flex-col gap-3", !ready && "invisible")}
                    aria-hidden={!ready}
                >
                    {/* The total is the headline (the title names the pack);
                        what it includes and the card fit one line under it. */}
                    {session && (
                        <div className="flex flex-col gap-1 tabular-nums">
                            <p className="text-3xl font-bold leading-none text-theme-text-strong">
                                {session.total.total.amount}
                            </p>
                            <p className="text-[13px] text-theme-text-muted">
                                {[
                                    !taxReady
                                        ? "Includes service fee, before tax"
                                        : tax && tax.minorUnitsAmount > 0
                                          ? `Includes service fee and ${tax.amount} tax`
                                          : "Includes service fee",
                                    card &&
                                        formatCard(
                                            card.card.brand,
                                            card.card.last4,
                                        ),
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>
                    )}
                    <div ref={currencySelector} />
                    {needsDetails && card && (
                        <p className="text-[13px] leading-snug text-theme-text-muted">
                            Stripe needs your full billing address to work out
                            tax. On Stripe, open your initials (top right), then
                            Profile settings, then buy again.
                        </p>
                    )}
                    {selector === "failed" && card && (
                        <p className="text-[13px] leading-snug text-theme-text-muted">
                            The currency choice didn’t load here, so pay on
                            Stripe’s page instead.
                        </p>
                    )}
                    {error && <ErrorLine>{error}</ErrorLine>}
                </div>
            </div>
        </DialogBody>
    );
};

const READY_TIMEOUT_MS = 4000;

/**
 * Every state can be left: on a phone the modal fills the screen and has no
 * backdrop to tap. "Close" once the payment went through.
 */
const CloseButton: FC<{
    onClick: () => void;
    label?: "Cancel" | "Close";
    disabled?: boolean;
}> = ({ onClick, label = "Cancel", disabled }) => (
    <Button
        icon={<XIcon />}
        type="button"
        intent="neutral"
        onClick={onClick}
        disabled={disabled}
    >
        {label}
    </Button>
);

/**
 * The one loading state, as tall as the summary it stands in for, so the
 * modal keeps its size when everything appears.
 */
const CheckoutLoading: FC<{ overlay?: boolean }> = ({ overlay }) => (
    <div
        className={cn(
            "flex min-h-40 items-center justify-center",
            overlay && "absolute inset-0",
        )}
    >
        <LoadingStatus>Loading checkout…</LoadingStatus>
    </div>
);

/** Leaves for Stripe's hosted page: a navigation, so a filled button. */
const HostedButton: FC<{ href: string; children: ReactNode }> = ({
    href,
    children,
}) => (
    <Button as="a" href={href} size="lg" icon={<ExternalLinkIcon />}>
        {children}
    </Button>
);

const ErrorLine: FC<{ children: ReactNode }> = ({ children }) => (
    <p
        role="alert"
        className="flex items-start gap-2 text-sm leading-5 text-theme-text-muted"
    >
        <WarningIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{children}</span>
    </p>
);
