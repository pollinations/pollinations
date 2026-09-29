import {
    Button,
    CardIcon,
    Dialog,
    DialogBody,
    ExternalLinkIcon,
    InlineLink,
    LoadingStatus,
    WarningIcon,
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

/**
 * A Checkout Session shown in the wallet: our confirmation screen when the
 * buyer has a card saved at Checkout ("custom"), else Stripe's form.
 */
type WalletCheckout = {
    mode: "custom" | "embedded";
    clientSecret: string;
    sessionId: string;
    publishableKey: string;
};

type StartResult =
    | { ok: true; checkout: WalletCheckout }
    | { ok: false; message: string; offerHosted: boolean };

/** The open session for one pack and screen, kept while the page lives. */
type SessionSlot = { key: string; start: Promise<StartResult> };

export function hostedCheckoutHref(packKey: string, query: string): string {
    return `/api/stripe/checkout/${packKey}${query ? `?${query}` : ""}`;
}

async function startWalletCheckout(
    packKey: PollenPackKey,
    query: string,
    stripeForm: boolean,
): Promise<StartResult> {
    const params = new URLSearchParams(query);
    if (stripeForm) params.set("form", "stripe");
    const search = params.toString();
    try {
        const response = await fetch(
            `${config.apiBaseUrl}/stripe/checkout/${packKey}/embedded${search ? `?${search}` : ""}`,
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
};

/**
 * Checkout inside the wallet. A returning buyer confirms with their saved
 * card (pack → Confirm); anyone else pays in Stripe's form (pack → Pay).
 * Reopening for the same pack mounts the same session. Hosted Checkout stays
 * one link away until the payment is submitted.
 */
export const PackCheckoutDialog: FC<PackCheckoutDialogProps> = ({
    open,
    onOpenChange,
    pack,
    checkoutQuery,
    onCredited,
}) => {
    const slot = useRef<SessionSlot | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [stripeForm, setStripeForm] = useState(false);

    function sessionFor(
        packKey: PollenPackKey,
        form: boolean,
    ): Promise<StartResult> {
        const key = `${packKey}:${form}`;
        if (slot.current?.key !== key) {
            const start = startWalletCheckout(packKey, checkoutQuery, form);
            slot.current = { key, start };
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
            onOpenChange={(next) => {
                if (!next) setStripeForm(false);
                onOpenChange(next);
            }}
            size="md"
            title={`Buy ${formatPollenPackValue(pack.amountUsd)} Pollen`}
        >
            {open && (
                <CheckoutBody
                    key={`${pack.packKey}:${stripeForm}:${attempt}`}
                    pack={pack}
                    hostedHref={hostedCheckoutHref(pack.packKey, checkoutQuery)}
                    start={() => sessionFor(pack.packKey, stripeForm)}
                    onUseStripeForm={() => setStripeForm(true)}
                    onFinished={() => {
                        slot.current = null;
                    }}
                    onRetry={() => {
                        slot.current = null;
                        setAttempt((value) => value + 1);
                    }}
                    onCredited={onCredited}
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
    pack: PollenPack;
    hostedHref: string;
    start: () => Promise<StartResult>;
    onUseStripeForm: () => void;
    onFinished: () => void;
    onRetry: () => void;
    onCredited?: () => void;
}> = ({
    pack,
    hostedHref,
    start,
    onUseStripeForm,
    onFinished,
    onRetry,
    onCredited,
}) => {
    const [state, setState] = useState<BodyState>({ phase: "loading" });
    // Read once on mount: a new pack, screen or retry remounts this body.
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

    function complete(sessionId: string): void {
        onFinished();
        setState({ phase: "complete", sessionId });
    }

    switch (state.phase) {
        case "loading":
            return (
                <DialogBody>
                    <LoadingStatus>Loading checkout…</LoadingStatus>
                </DialogBody>
            );
        case "complete":
            return (
                <DialogBody>
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
                        state.offerHosted ? (
                            <Button
                                as="a"
                                href={hostedHref}
                                icon={<ExternalLinkIcon />}
                            >
                                Pay on Stripe’s page
                            </Button>
                        ) : undefined
                    }
                >
                    <ErrorLine>{state.message}</ErrorLine>
                </DialogBody>
            );
        case "ready":
            return state.checkout.mode === "custom" ? (
                <SavedCardConfirmation
                    pack={pack}
                    stripe={state.stripe}
                    checkout={state.checkout}
                    onComplete={complete}
                    onUseStripeForm={onUseStripeForm}
                />
            ) : (
                <EmbeddedForm
                    stripe={state.stripe}
                    checkout={state.checkout}
                    hostedHref={hostedHref}
                    onComplete={complete}
                    onError={() => setState(LOAD_ERROR)}
                />
            );
    }
};

/** Settles once no embedded form is mounted or being created. */
let embeddedFormFree: Promise<void> = Promise.resolve();

/** Stripe's own form: card entry, "Save", other methods, 3DS. */
const EmbeddedForm: FC<{
    stripe: Stripe;
    checkout: WalletCheckout;
    hostedHref: string;
    onComplete: (sessionId: string) => void;
    onError: () => void;
}> = ({ stripe, checkout, hostedHref, onComplete, onError }) => {
    const container = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let canceled = false;
        let destroy: (() => void) | undefined;
        // Stripe allows one embedded form per page, so a new form waits until
        // the previous one (a quick reopen) is destroyed.
        const run = embeddedFormFree.then(async () => {
            if (canceled) return;
            const instance = await stripe.initEmbeddedCheckout({
                clientSecret: checkout.clientSecret,
                onComplete: () => onCompleteRef.current(checkout.sessionId),
            });
            if (canceled || !container.current) return instance.destroy();
            instance.mount(container.current);
            destroy = () => instance.destroy();
            setMounted(true);
        });
        embeddedFormFree = run.catch(() => {});
        run.catch(() => {
            if (!canceled) onErrorRef.current();
        });
        return () => {
            canceled = true;
            destroy?.();
        };
    }, [stripe, checkout]);

    return (
        <DialogBody
            footnote={
                <Footnote icon={<ExternalLinkIcon />}>
                    <InlineLink href={hostedHref} showIcon={false}>
                        Pay on Stripe’s page instead
                    </InlineLink>
                </Footnote>
            }
        >
            {!mounted && <LoadingStatus>Loading checkout…</LoadingStatus>}
            <div ref={container} />
        </DialogBody>
    );
};

/**
 * Our confirmation for a returning buyer: the pack, the localized total with
 * tax, the saved card and one Confirm. Stripe still runs the Checkout Session
 * (Adaptive Pricing, tax, 3DS when the bank asks), and its currency selector
 * must stay visible next to the price.
 */
const SavedCardConfirmation: FC<{
    pack: PollenPack;
    stripe: Stripe;
    checkout: WalletCheckout;
    onComplete: (sessionId: string) => void;
    onUseStripeForm: () => void;
}> = ({ pack, stripe, checkout, onComplete, onUseStripeForm }) => {
    const currencySelector = useRef<HTMLDivElement>(null);
    const [session, setSession] = useState<StripeCheckoutSession | null>(null);
    const [confirm, setConfirm] = useState<
        ((paymentMethod: string) => Promise<string | null>) | null
    >(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const onUseStripeFormRef = useRef(onUseStripeForm);
    onUseStripeFormRef.current = onUseStripeForm;

    useEffect(() => {
        let canceled = false;
        let destroySelector: (() => void) | undefined;
        const elements = stripe.initCheckout({
            clientSecret: checkout.clientSecret,
            adaptivePricing: { allowed: true },
        });
        elements.on("change", (next) => {
            if (!canceled) setSession(next);
        });
        void (async () => {
            const loaded = await elements.loadActions();
            if (canceled) return;
            if (loaded.type === "error") return onUseStripeFormRef.current();
            let current = loaded.actions.getSession();
            const saved = current.savedPaymentMethods?.[0];
            // Tax follows the card's billing address, as in Stripe's form, so
            // the total shown is the total charged.
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
            // No card to offer, or no way to price tax: use Stripe's form.
            if (!saved || current.tax.status !== "ready")
                return onUseStripeFormRef.current();
            setSession(current);
            setConfirm(() => async (paymentMethod: string) => {
                const result = await loaded.actions.confirm({
                    paymentMethod,
                    redirect: "if_required",
                });
                return result.type === "success"
                    ? null
                    : result.error.message || "Payment didn’t go through.";
            });
            if (current.currencyOptions?.length && currencySelector.current) {
                const selector = elements.createCurrencySelectorElement();
                selector.mount(currencySelector.current);
                destroySelector = () => selector.destroy();
            }
        })().catch(() => {
            if (!canceled) onUseStripeFormRef.current();
        });
        return () => {
            canceled = true;
            destroySelector?.();
        };
    }, [stripe, checkout]);

    const card = session?.savedPaymentMethods?.[0];
    const tax = session?.total.taxExclusive;
    const ready = Boolean(
        // Not session.canConfirm: it waits for a Payment Element, which the
        // saved card replaces.
        session?.tax.status === "ready" && card && confirm,
    );

    async function submit(): Promise<void> {
        if (!card || !confirm) return;
        setSubmitting(true);
        setError(null);
        const failure = await confirm(card.id);
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
                <Button
                    intent="commit"
                    size="lg"
                    disabled={!ready || submitting}
                    onClick={() => void submit()}
                    className="tabular-nums"
                >
                    {submitting
                        ? "Confirming…"
                        : session
                          ? `Confirm · ${session.total.total.amount}`
                          : "Confirm"}
                </Button>
            }
            footnote={
                <Footnote icon={<CardIcon />}>
                    <button
                        type="button"
                        className="polli-link"
                        disabled={submitting}
                        onClick={onUseStripeForm}
                    >
                        Pay another way
                    </button>
                </Footnote>
            }
        >
            {!session && <LoadingStatus>Loading your card…</LoadingStatus>}
            {session && (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
                    <dt className="text-theme-text-muted">Pack</dt>
                    <dd className="text-right font-semibold">
                        {formatPollenPackValue(pack.amountUsd)} Pollen
                    </dd>
                    {tax && tax.minorUnitsAmount > 0 && (
                        <>
                            <dt className="text-theme-text-muted">Tax</dt>
                            <dd className="text-right">{tax.amount}</dd>
                        </>
                    )}
                    <dt className="text-theme-text-muted">
                        Total, incl. service fee
                    </dt>
                    <dd className="text-right text-base font-bold">
                        {session.total.total.amount}
                    </dd>
                    {card && (
                        <>
                            <dt className="text-theme-text-muted">Card</dt>
                            <dd className="text-right capitalize">
                                {card.card.brand} •••• {card.card.last4}
                            </dd>
                        </>
                    )}
                </dl>
            )}
            <div ref={currencySelector} />
            {error && <ErrorLine>{error}</ErrorLine>}
        </DialogBody>
    );
};

const ErrorLine: FC<{ children: ReactNode }> = ({ children }) => (
    <p
        role="alert"
        className="flex items-start gap-2 text-sm leading-5 text-theme-text-muted"
    >
        <WarningIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{children}</span>
    </p>
);

const Footnote: FC<{ icon: ReactNode; children: ReactNode }> = ({
    icon,
    children,
}) => (
    <p className="flex items-start gap-1.5 px-(--polli-dialog-gutter) pb-6 text-[13px] leading-snug text-theme-text-muted">
        <span
            aria-hidden="true"
            className="mt-0.5 flex h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full"
        >
            {icon}
        </span>
        <span>{children}</span>
    </p>
);
