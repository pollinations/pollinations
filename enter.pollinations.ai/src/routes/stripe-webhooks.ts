import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type Stripe from "stripe";
import { getPollenPack } from "@/pollen-packs.ts";
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
    customerEmail: string;
    livemode: boolean;
    payload: Stripe.Event;
}

const LEGACY_BETA_MULTIPLIER = 2;

type CheckoutSessionResult = {
    success: boolean;
    message: string;
    pollenCredited?: number;
    duplicate?: boolean;
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
 * Handle successful checkout session completion
 * Credits pollen to user's packBalance
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
    const pack = metadata.packAmount
        ? getPollenPack(metadata.packAmount)
        : undefined;

    if (amountPaid <= 0) {
        console.error("Invalid payment amount:", session.amount_total);
        return { success: false, message: "Invalid payment amount" };
    }

    if (!pack && metadata.packAmount) {
        console.error("Missing or invalid packAmount in checkout session:", {
            sessionId: session.id,
            packAmount: metadata.packAmount,
        });
        return {
            success: false,
            message: "Missing or invalid pack metadata",
        };
    }

    // Prefer the grant snapshotted into session metadata at checkout creation
    // time; this guarantees the user is credited exactly what they saw, even
    // when bonus values change between session creation and payment. Falls
    // back to the current catalog (legacy sessions created pre-snapshot) and
    // finally to the legacy beta multiplier (sessions without packAmount).
    const metadataGrant = metadata.pollenGrant
        ? Number.parseInt(metadata.pollenGrant, 10)
        : Number.NaN;
    const creditsToAdd =
        Number.isFinite(metadataGrant) && metadataGrant > 0
            ? metadataGrant
            : pack
              ? pack.pollenGrant
              : amountPaid * LEGACY_BETA_MULTIPLIER;

    const db = drizzle(env.DB);

    // Check if user exists
    const [user] = await db
        .select({ id: userTable.id, packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    if (!user) {
        console.error("User not found:", userId);
        return { success: false, message: "User not found" };
    }

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

    if (!pack) {
        console.warn(
            "Legacy Stripe checkout session missing packAmount; applying 2x fallback",
            {
                sessionId: session.id,
                amountPaid,
            },
        );
    }

    console.log(
        pack
            ? `Stripe: Credited ${creditsToAdd} pollen to user ${userId} (pack: $${pack.amountUsd}, paid: $${amountPaid}, session: ${session.id})`
            : `Stripe: Credited ${creditsToAdd} pollen to user ${userId} (legacy fallback, paid: $${amountPaid}, session: ${session.id})`,
    );

    return {
        success: true,
        message: `Credited ${creditsToAdd} pollen to user ${userId}`,
        pollenCredited: creditsToAdd,
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

        // Get raw body for signature verification
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

        // Handle the event
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                // Only process completed payments (not pending async payments)
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
                        // Send to TinyBird in background using waitUntil
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
                                paymentMethod:
                                    session.payment_method_types?.[0] ||
                                    "unknown",
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
                // Handle delayed payment methods (e.g., bank transfers)
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
                    // Send to TinyBird in background using waitUntil
                    c.executionCtx.waitUntil(
                        sendStripeEventToTinybird(c.env, {
                            eventType: event.type,
                            eventId: event.id,
                            sessionId: session.id,
                            userId: session.metadata.userId || "",
                            amountCents: session.amount_total || 0,
                            currency: session.currency || "usd",
                            paymentStatus: session.payment_status || "unknown",
                            paymentMethod:
                                session.payment_method_types?.[0] || "unknown",
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
                // No action needed - user didn't pay
                break;
            }

            case "checkout.session.expired": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log(`Checkout session expired: ${session.id}`);
                // Log to TinyBird for analytics
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
                // This event contains the ACTUAL payment method used
                const actualPaymentMethod =
                    paymentIntent.payment_method_types?.[0] || "unknown";
                c.executionCtx.waitUntil(
                    sendStripeEventToTinybird(c.env, {
                        eventType: event.type,
                        eventId: event.id,
                        sessionId: paymentIntent.id, // payment_intent ID
                        userId: paymentIntent.metadata?.userId || "",
                        amountCents: paymentIntent.amount || 0,
                        currency: paymentIntent.currency || "usd",
                        paymentStatus: paymentIntent.status || "succeeded",
                        paymentMethod: actualPaymentMethod,
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
                    }).catch((err) =>
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
                // Terminal Stripe-side states. The invoice itself is already
                // in its final form, so we only record the attempt outcome —
                // do not disable auto top-up for the user (e.g. they might
                // have voided the invoice themselves via the portal).
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
                c.executionCtx.waitUntil(
                    sendStripeEventToTinybird(c.env, {
                        eventType: event.type,
                        eventId: event.id,
                        sessionId: paymentIntent.id,
                        userId: paymentIntent.metadata?.userId || "",
                        amountCents: paymentIntent.amount || 0,
                        currency: paymentIntent.currency || "usd",
                        paymentStatus: "failed",
                        paymentMethod:
                            paymentIntent.payment_method_types?.[0] ||
                            "unknown",
                        customerEmail: paymentIntent.receipt_email || "",
                        livemode: event.livemode,
                        payload: event,
                    }).catch((err) =>
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

        // Always return 200 to acknowledge receipt
        return c.json({ received: true });
    });
