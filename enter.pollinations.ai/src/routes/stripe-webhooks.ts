import { user as userTable } from "@shared/db/better-auth.ts";
import { getPollenPack } from "@shared/pollen-packs.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type Stripe from "stripe";
import type { Env } from "../env.ts";
import { createStripeClient, verifyWebhookSignature } from "../utils/stripe.ts";
import {
    creditAutoTopUpInvoice,
    markAutoTopUpInvoiceFailed,
} from "../utils/stripe-billing.ts";

interface StripeEventData {
    eventType: string;
    eventId: string;
    sessionId: string;
    userId: string;
    amountCents: number;
    currency: string;
    paymentStatus: string;
    paymentMethod: string;
    paymentMethodRaw?: string;
    paymentMethodWallet?: string;
    paymentMethodsOffered?: string;
    presentmentCurrency?: string;
    presentmentAmount?: number;
    cardCountry?: string;
    cardBrand?: string;
    cardNetwork?: string;
    riskLevel?: string;
    riskScore?: number;
    customerEmail: string;
    livemode: boolean;
    payload: Stripe.Event;
}

type ChargeSnapshot = {
    paymentMethod: string;
    paymentMethodRaw: string;
    paymentMethodWallet: string;
    cardCountry: string;
    cardBrand: string;
    cardNetwork: string;
    riskLevel: string;
    riskScore: number;
};

const EMPTY_CHARGE_SNAPSHOT: ChargeSnapshot = {
    paymentMethod: "unknown",
    paymentMethodRaw: "",
    paymentMethodWallet: "",
    cardCountry: "",
    cardBrand: "",
    cardNetwork: "",
    riskLevel: "",
    riskScore: 0,
};

/**
 * Read every observability field we want from a Charge:
 * - normalized payment method (wallet name when card+wallet, else raw type)
 * - card-issuer country / brand / network (when the charge is a card)
 * - Stripe Radar's outcome.risk_level + risk_score (any payment method)
 */
function snapshotFromCharge(
    charge: Stripe.Charge | null | undefined,
): ChargeSnapshot {
    if (!charge) return EMPTY_CHARGE_SNAPSHOT;

    const details = charge.payment_method_details;
    const raw = details?.type ?? "";
    const wallet =
        raw === "card" && details?.card?.wallet?.type
            ? details.card.wallet.type
            : "";
    const card = details?.card;
    const outcome = charge.outcome;

    return {
        paymentMethod: wallet || raw || "unknown",
        paymentMethodRaw: raw,
        paymentMethodWallet: wallet,
        cardCountry: card?.country ?? "",
        cardBrand: card?.brand ?? "",
        cardNetwork: card?.network ?? "",
        riskLevel: outcome?.risk_level ?? "",
        riskScore: outcome?.risk_score ?? 0,
    };
}

/**
 * Retrieve the latest Charge on a PaymentIntent so we can read
 * payment_method_details + card.country (only present on Charge, not on PI).
 * `latest_charge` is returned as an ID string without `expand`; we expand it.
 *
 * Used by the two analytics-only event handlers — payment_intent.succeeded
 * (for dashboards that join checkout sessions to the PI for the real method)
 * and payment_intent.payment_failed (for card_country on declines, since
 * Stripe doesn't fire charge.succeeded on failure). Never called on the
 * credit-grant path (checkout.session.completed), which stays a pure D1 write.
 */
async function fetchChargeForPaymentIntent(
    stripe: Stripe,
    paymentIntentId: string | Stripe.PaymentIntent | null | undefined,
): Promise<Stripe.Charge | null> {
    if (!paymentIntentId) return null;
    const piId =
        typeof paymentIntentId === "string"
            ? paymentIntentId
            : paymentIntentId.id;
    if (!piId) return null;

    try {
        const pi = await stripe.paymentIntents.retrieve(piId, {
            expand: ["latest_charge"],
        });
        const lc = pi.latest_charge;
        if (lc && typeof lc !== "string") return lc;
        return null;
    } catch (err) {
        console.error(
            `Failed to retrieve PaymentIntent ${piId} for payment method details:`,
            err,
        );
        return null;
    }
}

function readPresentment(session: Stripe.Checkout.Session): {
    presentmentCurrency: string;
    presentmentAmount: number;
} {
    const details = (
        session as unknown as {
            presentment_details?: {
                presentment_currency?: string | null;
                presentment_amount?: number | null;
            };
        }
    ).presentment_details;
    return {
        presentmentCurrency: details?.presentment_currency ?? "",
        presentmentAmount: details?.presentment_amount ?? 0,
    };
}

type CheckoutSessionResult = {
    success: boolean;
    message: string;
    pollenCredited?: number;
    duplicate?: boolean;
    presentmentCurrency?: string;
    presentmentAmount?: number;
};

function isUniqueConstraintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("UNIQUE constraint failed");
}

async function creditCheckoutSessionOnce({
    env,
    event,
    session,
    userId,
    creditsToAdd,
}: {
    env: CloudflareBindings;
    event: Stripe.Event;
    session: Stripe.Checkout.Session;
    userId: string;
    creditsToAdd: number;
}): Promise<{ credited: boolean }> {
    const createdAt = Date.now();

    try {
        const [, updateResult] = await env.DB.batch([
            env.DB.prepare(
                `INSERT INTO stripe_checkout_credits (
                    session_id,
                    event_id,
                    event_type,
                    user_id,
                    pollen_credited,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            ).bind(
                session.id,
                event.id,
                event.type,
                userId,
                creditsToAdd,
                createdAt,
            ),
            env.DB.prepare(
                `UPDATE user
                SET pack_balance = COALESCE(pack_balance, 0) + ?
                WHERE id = ?`,
            ).bind(creditsToAdd, userId),
        ]);

        if ((updateResult.meta.changes ?? 0) !== 1) {
            throw new Error(
                `Stripe checkout credit failed to update user ${userId} for session ${session.id}`,
            );
        }

        return { credited: true };
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            return { credited: false };
        }
        throw error;
    }
}

async function sendStripeEventToTinybird(
    env: CloudflareBindings,
    data: StripeEventData,
): Promise<void> {
    const e = env as unknown as Record<string, string>;
    const tinybirdUrl = e.TINYBIRD_STRIPE_INGEST_URL;
    const tinybirdToken = e.TINYBIRD_INGEST_TOKEN;

    if (!tinybirdUrl || !tinybirdToken) {
        console.log("Tinybird Stripe ingest not configured, skipping");
        return;
    }

    const event = {
        timestamp: new Date().toISOString(),
        event_type: data.eventType,
        event_id: data.eventId,
        session_id: data.sessionId,
        user_id: data.userId,
        amount_cents: data.amountCents,
        currency: data.currency,
        payment_status: data.paymentStatus,
        payment_method: data.paymentMethod,
        payment_method_raw: data.paymentMethodRaw ?? "",
        payment_method_wallet: data.paymentMethodWallet ?? "",
        payment_methods_offered: data.paymentMethodsOffered ?? "",
        presentment_currency: data.presentmentCurrency ?? "",
        presentment_amount: data.presentmentAmount ?? 0,
        card_country: data.cardCountry ?? "",
        card_brand: data.cardBrand ?? "",
        card_network: data.cardNetwork ?? "",
        risk_level: data.riskLevel ?? "",
        risk_score: data.riskScore ?? 0,
        customer_email: data.customerEmail,
        livemode: data.livemode ? 1 : 0,
        payload: JSON.stringify(data.payload),
    };

    try {
        const response = await fetch(tinybirdUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tinybirdToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `Failed to send Stripe event to Tinybird: ${response.status} ${errorText}`,
            );
        }
    } catch (error) {
        console.error("Error sending Stripe event to Tinybird:", error);
    }
}

/**
 * Handle successful checkout session completion.
 * Credits pollen to user's packBalance and persists observability fields.
 * Pollen amount is derived from the selected pack metadata.
 */
const handleCheckoutSessionCompleted = async (
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
    env: CloudflareBindings,
): Promise<CheckoutSessionResult> => {
    const metadata = session.metadata;

    if (!metadata?.userId) {
        console.error("Missing userId in checkout session:", session.id);
        return { success: false, message: "Missing required metadata" };
    }

    const userId = metadata.userId;
    const amountPaid = Math.round((session.amount_subtotal || 0) / 100);
    const packAmount = metadata.packAmount;
    const pack = packAmount ? getPollenPack(packAmount) : undefined;

    if (amountPaid <= 0) {
        console.error("Invalid payment amount:", session.amount_total);
        return { success: false, message: "Invalid payment amount" };
    }

    if (!pack) {
        console.error("Missing or invalid pack in checkout session:", {
            sessionId: session.id,
            packAmount,
        });
        return {
            success: false,
            message: "Missing or invalid pack metadata",
        };
    }

    // Prefer the grant snapshotted into session metadata at checkout creation
    // time; this guarantees the user is credited exactly what they saw, even
    // when bonus values change between session creation and payment.
    const metadataGrantValue = metadata.packPollenGrant;
    const metadataGrant = metadataGrantValue
        ? Number.parseFloat(metadataGrantValue)
        : Number.NaN;
    const creditsToAdd =
        Number.isFinite(metadataGrant) && metadataGrant > 0
            ? metadataGrant
            : pack.pollenGrant;

    const db = drizzle(env.DB);

    const [user] = await db
        .select({ id: userTable.id, packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    if (!user) {
        console.error("User not found:", userId);
        return { success: false, message: "User not found" };
    }

    // Card-issuer country, brand, network, and Radar score arrive on the
    // separate charge.succeeded webhook and are written to Tinybird from
    // there. Keeping that data off the credit path keeps fulfillment fast
    // and removes a synchronous Stripe RTT that would otherwise gate every
    // pack purchase.
    const presentment = readPresentment(session);
    const sessionAmountTotal = session.amount_total ?? 0;
    const sessionCurrency = session.currency ?? "";

    const { credited } = await creditCheckoutSessionOnce({
        env,
        event,
        session,
        userId,
        creditsToAdd,
    });

    if (!credited) {
        console.log(
            `Stripe: Skipping duplicate checkout credit for user ${userId} (session: ${session.id}, event: ${event.id})`,
        );
        return {
            success: true,
            message: `Skipped duplicate checkout credit for session ${session.id}`,
            duplicate: true,
        };
    }

    console.log(
        `Stripe: Credited ${creditsToAdd} pollen to user ${userId} (pack: $${pack.amountUsd}, paid: ${sessionAmountTotal} ${sessionCurrency}, presentment: ${presentment.presentmentAmount} ${presentment.presentmentCurrency}, session: ${session.id})`,
    );

    return {
        success: true,
        message: `Credited ${creditsToAdd} pollen to user ${userId}`,
        pollenCredited: creditsToAdd,
        presentmentCurrency: presentment.presentmentCurrency,
        presentmentAmount: presentment.presentmentAmount,
    };
};

export const stripeWebhooksRoutes = new Hono<Env>()
    /**
     * POST /webhooks/stripe
     * Stripe webhook endpoint for payment events
     */
    .post("/stripe", async (c) => {
        const stripe = createStripeClient(c.env);
        const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("STRIPE_WEBHOOK_SECRET not configured");
            return c.json({ error: "Webhook secret not configured" }, 500);
        }

        const payload = await c.req.text();
        const signature = c.req.header("stripe-signature");

        if (!signature) {
            console.error("Missing stripe-signature header");
            return c.json({ error: "Missing signature" }, 400);
        }

        let event: Stripe.Event;

        try {
            event = await verifyWebhookSignature(
                stripe,
                payload,
                signature,
                webhookSecret,
            );
        } catch (err) {
            console.error("Webhook signature verification failed:", err);
            return c.json({ error: "Invalid signature" }, 400);
        }

        if (event.livemode !== (c.env.STRIPE_MODE === "live")) {
            console.warn("Stripe webhook mode mismatch:", {
                eventId: event.id,
                livemode: event.livemode,
                stripeMode: c.env.STRIPE_MODE,
            });
            return c.json({ received: true });
        }

        console.log(`Stripe webhook received: ${event.type} (${event.id})`);

        switch (event.type) {
            case "charge.succeeded": {
                // The Charge IS the event payload, so we can read
                // payment_method_details + card.country + risk_score directly
                // without an additional Stripe API call. Emitted to Tinybird
                // for analytics; D1 credit insert happens via the parallel
                // checkout.session.completed / async_payment_succeeded path.
                const charge = event.data.object as Stripe.Charge;
                const snapshot = snapshotFromCharge(charge);
                c.executionCtx.waitUntil(
                    sendStripeEventToTinybird(c.env, {
                        eventType: event.type,
                        eventId: event.id,
                        sessionId: charge.id,
                        userId: charge.metadata?.userId || "",
                        amountCents: charge.amount || 0,
                        currency: charge.currency || "usd",
                        paymentStatus: charge.status || "succeeded",
                        paymentMethod: snapshot.paymentMethod,
                        paymentMethodRaw: snapshot.paymentMethodRaw,
                        paymentMethodWallet: snapshot.paymentMethodWallet,
                        cardCountry: snapshot.cardCountry,
                        cardBrand: snapshot.cardBrand,
                        cardNetwork: snapshot.cardNetwork,
                        riskLevel: snapshot.riskLevel,
                        riskScore: snapshot.riskScore,
                        customerEmail:
                            charge.billing_details?.email ||
                            charge.receipt_email ||
                            "",
                        livemode: event.livemode,
                        payload: event,
                    }).catch((err) =>
                        console.error("TinyBird Stripe send failed:", err),
                    ),
                );
                break;
            }

            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                if (session.payment_status === "paid") {
                    const result = await handleCheckoutSessionCompleted(
                        event,
                        session,
                        c.env,
                    );

                    if (result.duplicate) {
                        break;
                    }

                    if (result.success && session.metadata) {
                        const methodsOffered = (
                            session.payment_method_types ?? []
                        ).join(",");

                        c.executionCtx.waitUntil(
                            sendStripeEventToTinybird(c.env, {
                                eventType: event.type,
                                eventId: event.id,
                                sessionId: session.id,
                                userId: session.metadata.userId || "",
                                amountCents: session.amount_total || 0,
                                currency: session.currency || "usd",
                                paymentStatus:
                                    session.payment_status || "unknown",
                                paymentMethod: "unknown",
                                paymentMethodsOffered: methodsOffered,
                                presentmentCurrency:
                                    result.presentmentCurrency ?? "",
                                presentmentAmount:
                                    result.presentmentAmount ?? 0,
                                customerEmail: session.customer_email || "",
                                livemode: event.livemode,
                                payload: event,
                            }).catch((err) =>
                                console.error(
                                    "TinyBird Stripe send failed:",
                                    err,
                                ),
                            ),
                        );
                    } else {
                        console.error(
                            "Failed to process checkout:",
                            result.message,
                        );
                    }
                } else {
                    console.log(
                        `Checkout session ${session.id} not yet paid (status: ${session.payment_status})`,
                    );
                }
                break;
            }

            case "checkout.session.async_payment_succeeded": {
                const session = event.data.object as Stripe.Checkout.Session;

                const result = await handleCheckoutSessionCompleted(
                    event,
                    session,
                    c.env,
                );

                if (result.duplicate) {
                    break;
                }

                if (result.success && session.metadata) {
                    const methodsOffered = (
                        session.payment_method_types ?? []
                    ).join(",");

                    c.executionCtx.waitUntil(
                        sendStripeEventToTinybird(c.env, {
                            eventType: event.type,
                            eventId: event.id,
                            sessionId: session.id,
                            userId: session.metadata.userId || "",
                            amountCents: session.amount_total || 0,
                            currency: session.currency || "usd",
                            paymentStatus: session.payment_status || "unknown",
                            paymentMethod: "unknown",
                            paymentMethodsOffered: methodsOffered,
                            presentmentCurrency:
                                result.presentmentCurrency ?? "",
                            presentmentAmount: result.presentmentAmount ?? 0,
                            customerEmail: session.customer_email || "",
                            livemode: event.livemode,
                            payload: event,
                        }).catch((err) =>
                            console.error("TinyBird Stripe send failed:", err),
                        ),
                    );
                } else {
                    console.error(
                        "Failed to process async payment:",
                        result.message,
                    );
                }
                break;
            }

            case "checkout.session.async_payment_failed": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log(`Async payment failed for session ${session.id}`);
                break;
            }

            case "checkout.session.expired": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log(`Checkout session expired: ${session.id}`);
                c.executionCtx.waitUntil(
                    sendStripeEventToTinybird(c.env, {
                        eventType: event.type,
                        eventId: event.id,
                        sessionId: session.id,
                        userId: session.metadata?.userId || "",
                        amountCents: session.amount_total || 0,
                        currency: session.currency || "usd",
                        paymentStatus: "expired",
                        paymentMethod: "unknown",
                        customerEmail: session.customer_email || "",
                        livemode: event.livemode,
                        payload: event,
                    }).catch((err) =>
                        console.error("TinyBird Stripe send failed:", err),
                    ),
                );
                break;
            }

            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                console.log(`Payment intent succeeded: ${paymentIntent.id}`);
                const methodsOffered = (
                    paymentIntent.payment_method_types ?? []
                ).join(",");
                // Analytics-only path: the charge fetch + Tinybird send both
                // happen inside waitUntil so the webhook ACK is not blocked
                // by a Stripe RTT. Dashboards join checkout sessions to this
                // event for the real payment_method. The credit-grant path
                // (checkout.session.completed) intentionally does NOT do
                // this fetch.
                c.executionCtx.waitUntil(
                    (async () => {
                        const charge = await fetchChargeForPaymentIntent(
                            stripe,
                            paymentIntent.id,
                        );
                        const snapshot = snapshotFromCharge(charge);
                        await sendStripeEventToTinybird(c.env, {
                            eventType: event.type,
                            eventId: event.id,
                            sessionId: paymentIntent.id,
                            userId: paymentIntent.metadata?.userId || "",
                            amountCents: paymentIntent.amount || 0,
                            currency: paymentIntent.currency || "usd",
                            paymentStatus: paymentIntent.status || "succeeded",
                            paymentMethod: snapshot.paymentMethod,
                            paymentMethodRaw: snapshot.paymentMethodRaw,
                            paymentMethodWallet: snapshot.paymentMethodWallet,
                            paymentMethodsOffered: methodsOffered,
                            cardCountry: snapshot.cardCountry,
                            cardBrand: snapshot.cardBrand,
                            cardNetwork: snapshot.cardNetwork,
                            riskLevel: snapshot.riskLevel,
                            riskScore: snapshot.riskScore,
                            customerEmail:
                                paymentIntent.receipt_email ||
                                (
                                    paymentIntent as unknown as {
                                        customer_email?: string;
                                    }
                                ).customer_email ||
                                "",
                            livemode: event.livemode,
                            payload: event,
                        });
                    })().catch((err) =>
                        console.error("TinyBird Stripe send failed:", err),
                    ),
                );
                break;
            }

            case "invoice.paid":
            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;
                const result = await creditAutoTopUpInvoice(c.env, invoice);
                if (result.credited) {
                    console.log(
                        `Stripe auto top-up invoice credited: ${invoice.id} (+${result.pollenCredited} pollen)`,
                    );
                }
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                await markAutoTopUpInvoiceFailed(
                    c.env,
                    invoice,
                    "Stripe could not charge the default payment method.",
                    { disableAutoTopUp: false },
                );
                break;
            }

            case "invoice.voided":
            case "invoice.marked_uncollectible": {
                const invoice = event.data.object as Stripe.Invoice;
                await markAutoTopUpInvoiceFailed(
                    c.env,
                    invoice,
                    "Stripe invoice can no longer be collected.",
                    { cleanupInvoice: false, disableAutoTopUp: false },
                );
                break;
            }

            case "payment_intent.payment_failed": {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                console.log(`Payment intent failed: ${paymentIntent.id}`);
                const failedMethodsOffered = (
                    paymentIntent.payment_method_types ?? []
                ).join(",");
                // Analytics-only: same shape as payment_intent.succeeded.
                // Stripe doesn't fire charge.succeeded on a failed payment, so
                // we retrieve the failed Charge here to capture card_country
                // and Radar fields for the decline. Fetch + send live inside
                // waitUntil so the webhook ACK isn't blocked.
                c.executionCtx.waitUntil(
                    (async () => {
                        const failedCharge = await fetchChargeForPaymentIntent(
                            stripe,
                            paymentIntent.id,
                        );
                        const failedSnapshot = snapshotFromCharge(failedCharge);
                        await sendStripeEventToTinybird(c.env, {
                            eventType: event.type,
                            eventId: event.id,
                            sessionId: paymentIntent.id,
                            userId: paymentIntent.metadata?.userId || "",
                            amountCents: paymentIntent.amount || 0,
                            currency: paymentIntent.currency || "usd",
                            paymentStatus: "failed",
                            paymentMethod: failedSnapshot.paymentMethod,
                            paymentMethodRaw: failedSnapshot.paymentMethodRaw,
                            paymentMethodWallet:
                                failedSnapshot.paymentMethodWallet,
                            paymentMethodsOffered: failedMethodsOffered,
                            cardCountry: failedSnapshot.cardCountry,
                            cardBrand: failedSnapshot.cardBrand,
                            cardNetwork: failedSnapshot.cardNetwork,
                            riskLevel: failedSnapshot.riskLevel,
                            riskScore: failedSnapshot.riskScore,
                            customerEmail: paymentIntent.receipt_email || "",
                            livemode: event.livemode,
                            payload: event,
                        });
                    })().catch((err) =>
                        console.error("TinyBird Stripe send failed:", err),
                    ),
                );
                break;
            }

            case "refund.created":
            case "refund.updated":
            case "refund.failed": {
                const refund = event.data.object as Stripe.Refund;
                console.log(`Refund ${event.type}: ${refund.id}`);
                c.executionCtx.waitUntil(
                    sendStripeEventToTinybird(c.env, {
                        eventType: event.type,
                        eventId: event.id,
                        sessionId:
                            refund.payment_intent?.toString() || refund.id,
                        userId: refund.metadata?.userId || "",
                        amountCents: refund.amount || 0,
                        currency: refund.currency || "usd",
                        paymentStatus: refund.status || "unknown",
                        paymentMethod: "refund",
                        customerEmail: "",
                        livemode: event.livemode,
                        payload: event,
                    }).catch((err) =>
                        console.error("TinyBird Stripe send failed:", err),
                    ),
                );
                break;
            }

            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }

        return c.json({ received: true });
    });
