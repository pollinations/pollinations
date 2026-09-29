import {
    Button,
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
    type StripeEmbeddedCheckout,
} from "@stripe/stripe-js";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { config } from "../../config.ts";
import { CheckoutConfirmation } from "./checkout-confirmation.tsx";

type EmbeddedCheckoutSession = {
    clientSecret: string;
    sessionId: string;
    publishableKey: string;
};

type StartResult =
    | { ok: true; session: EmbeddedCheckoutSession }
    | { ok: false; message: string; offerHosted: boolean };

/** The open session for one pack, kept while the page lives. */
type SessionSlot = { packKey: PollenPackKey; start: Promise<StartResult> };

/** Without a rendered form by then, point at hosted Checkout (never redirect). */
const SLOW_FORM_MS = 10_000;

export function hostedCheckoutHref(packKey: string, query: string): string {
    return `/api/stripe/checkout/${packKey}${query ? `?${query}` : ""}`;
}

async function startEmbeddedCheckout(
    packKey: PollenPackKey,
    query: string,
): Promise<StartResult> {
    try {
        const response = await fetch(
            `${config.apiBaseUrl}/stripe/checkout/${packKey}/embedded${query ? `?${query}` : ""}`,
            { method: "POST", credentials: "include" },
        );
        const body = (await response.json().catch(() => null)) as
            | (Partial<EmbeddedCheckoutSession> & { error?: string })
            | null;
        if (response.ok && body?.clientSecret)
            return { ok: true, session: body as EmbeddedCheckoutSession };
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

function reportFormReady(sessionId: string, packKey: string): void {
    const query = new URLSearchParams({
        session_id: sessionId,
        pack_key: packKey,
    });
    void fetch(`${config.apiBaseUrl}/analytics/checkout-ready?${query}`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
    }).catch(() => {});
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
 * Stripe Checkout inside the wallet: Buy → Pay → "Pollen added". Reopening
 * for the same pack mounts the same session; changing the pack starts a new
 * one. Hosted Checkout stays one link away until the payment is submitted.
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

    function sessionFor(packKey: PollenPackKey): Promise<StartResult> {
        if (slot.current?.packKey !== packKey) {
            const start = startEmbeddedCheckout(packKey, checkoutQuery);
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
                <EmbeddedCheckoutBody
                    key={`${pack.packKey}:${attempt}`}
                    pack={pack}
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
                />
            )}
        </Dialog>
    );
};

type BodyState =
    | { phase: "loading"; rendered: false }
    | { phase: "form"; rendered: boolean }
    | { phase: "error"; message: string; offerHosted: boolean }
    | { phase: "complete"; sessionId: string };

const EmbeddedCheckoutBody: FC<{
    pack: PollenPack;
    hostedHref: string;
    start: () => Promise<StartResult>;
    onFinished: () => void;
    onRetry: () => void;
    onCredited?: () => void;
}> = ({ pack, hostedHref, start, onFinished, onRetry, onCredited }) => {
    const [state, setState] = useState<BodyState>({
        phase: "loading",
        rendered: false,
    });
    const [slow, setSlow] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    // Read once on mount: a new pack or retry remounts this body.
    const props = useRef({ pack, start, onFinished });

    useEffect(() => {
        const { pack, start, onFinished } = props.current;
        let canceled = false;
        let checkout: StripeEmbeddedCheckout | undefined;
        const slowTimer = setTimeout(() => setSlow(true), SLOW_FORM_MS);

        async function mount(): Promise<void> {
            const result = await start();
            if (canceled) return;
            if (!result.ok) {
                setState({ phase: "error", ...result });
                return;
            }
            const { session } = result;
            const stripe = await loadStripeOnce(session.publishableKey);
            if (canceled) return;
            if (!stripe) {
                setState({
                    phase: "error",
                    message: "Couldn’t load checkout.",
                    offerHosted: true,
                });
                return;
            }
            const instance = await stripe.initEmbeddedCheckout({
                clientSecret: session.clientSecret,
                onComplete: () => {
                    onFinished();
                    setState({
                        phase: "complete",
                        sessionId: session.sessionId,
                    });
                },
                onAnalyticsEvent: (event) => {
                    if (event.eventType !== "checkoutRendered") return;
                    clearTimeout(slowTimer);
                    setSlow(false);
                    setState((current) =>
                        current.phase === "form"
                            ? { phase: "form", rendered: true }
                            : current,
                    );
                    reportFormReady(session.sessionId, pack.packKey);
                },
            });
            // Stripe allows one embedded form per page: never leak one.
            if (canceled || !container.current) {
                instance.destroy();
                return;
            }
            checkout = instance;
            instance.mount(container.current);
            setState((current) =>
                current.phase === "loading"
                    ? { phase: "form", rendered: false }
                    : current,
            );
        }

        mount().catch(() => {
            if (!canceled)
                setState({
                    phase: "error",
                    message: "Couldn’t load checkout.",
                    offerHosted: true,
                });
        });
        return () => {
            canceled = true;
            clearTimeout(slowTimer);
            checkout?.destroy();
        };
    }, []);

    if (state.phase === "complete") {
        return (
            <DialogBody>
                <CheckoutConfirmation
                    sessionId={state.sessionId}
                    onCredited={onCredited}
                    onRetry={onRetry}
                />
            </DialogBody>
        );
    }

    if (state.phase === "error") {
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
                <p
                    role="alert"
                    className="flex items-start gap-2 text-sm leading-5 text-theme-text-muted"
                >
                    <WarningIcon
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>{state.message}</span>
                </p>
            </DialogBody>
        );
    }

    const rendered = state.phase === "form" && state.rendered;
    return (
        <DialogBody
            footnote={
                <p className="flex items-start gap-1.5 px-(--polli-dialog-gutter) pb-6 text-[13px] leading-snug text-theme-text-muted">
                    <ExternalLinkIcon
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span>
                        {slow && !rendered ? "Taking a while? " : ""}
                        <InlineLink href={hostedHref} showIcon={false}>
                            {slow && !rendered
                                ? "Pay on Stripe’s page"
                                : "Pay on Stripe’s page instead"}
                        </InlineLink>
                    </span>
                </p>
            }
        >
            {!rendered && <LoadingStatus>Loading checkout…</LoadingStatus>}
            <div ref={container} />
        </DialogBody>
    );
};
