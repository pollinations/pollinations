import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type Stripe from "stripe";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import {
    createStripeClient,
    markSessionProcessed,
    releaseSessionLock,
    tryAcquireSessionLock,
    verifyWebhookSignature,
} from "../utils/stripe.ts";

// BETA PROMOTION: Double all pack purchases (remove after beta)
const BETA_MULTIPLIER = 2;

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

async function sendStripeEventToTinybird(
    env: CloudflareBindings,
    data: StripeEventData,
): Promise<void> {
    const e = env as unknown as Record<string, string>;
    const tinybirdUrl = e.TINYBIRD_STRIPE_INGEST_URL;
    const tinybirdToken = e.TINYBIRD_STRIPE_INGEST_TOKEN;

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
 */
const handleCheckoutSessionCompleted = async (
    session: Stripe.Checkout.Session,
    env: CloudflareBindings,
): Promise<{ success: boolean; message: string }> => {
    const metadata = session.metadata;

    if (!metadata?.userId || !metadata?.units) {
        console.error("Missing metadata in checkout session:", session.id);
        return { success: false, message: "Missing required metadata" };
    }

    const userId = metadata.userId;
    const units = Number.parseInt(metadata.units, 10);
    const packSlug = metadata.packSlug || "unknown";

    if (Number.isNaN(units) || units <= 0) {
        console.error("Invalid units in metadata:", metadata.units);
        return { success: false, message: "Invalid units value" };
    }

    const creditsToAdd = units * BETA_MULTIPLIER;

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

    // Credit pollen to packBalance (cumulative, like Polar)
    await db
        .update(userTable)
        .set({
            packBalance: sql`COALESCE(${userTable.packBalance}, 0) + ${creditsToAdd}`,
        })
        .where(eq(userTable.id, userId));

    console.log(
        `Stripe: Credited ${creditsToAdd} pollen to user ${userId} (pack: ${packSlug}, paid: ${units}, session: ${session.id})`,
    );

    return {
        success: true,
        message: `Credited ${creditsToAdd} pollen to user ${userId}`,
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

        console.log(`Stripe webhook received: ${event.type} (${event.id})`);

        // Handle the event
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                // Only process completed payments (not pending async payments)
                if (session.payment_status === "paid") {
                    // Acquire lock BEFORE processing to prevent race conditions
                    // This marks the session as "processing" atomically
                    const acquired = await tryAcquireSessionLock(
                        c.env.KV,
                        session.id,
                    );
                    if (!acquired) {
                        console.log(
                            `Stripe: Session ${session.id} already processing/processed, skipping`,
                        );
                        break;
                    }

                    const result = await handleCheckoutSessionCompleted(
                        session,
                        c.env,
                    );

                    if (result.success && session.metadata) {
                        const pollenPaid = Number.parseInt(
                            session.metadata.units || "0",
                            10,
                        );
                        // Mark as completed with full metadata (extends TTL to 7 days)
                        await markSessionProcessed(c.env.KV, session.id, {
                            userId: session.metadata.userId || "",
                            units: pollenPaid,
                            packSlug: session.metadata.packSlug || "unknown",
                        });

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
                        // Release lock on failure to allow Stripe retry
                        await releaseSessionLock(c.env.KV, session.id);
                        console.error(
                            "Failed to process checkout:",
                            result.message,
                        );
                        // Still return 200 to acknowledge receipt
                        // Stripe will show the error in dashboard
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

                // Acquire lock BEFORE processing to prevent race conditions
                const acquired = await tryAcquireSessionLock(
                    c.env.KV,
                    session.id,
                );
                if (!acquired) {
                    console.log(
                        `Stripe: Async session ${session.id} already processing/processed, skipping`,
                    );
                    break;
                }

                const result = await handleCheckoutSessionCompleted(
                    session,
                    c.env,
                );

                if (result.success && session.metadata) {
                    const pollenPaid = Number.parseInt(
                        session.metadata.units || "0",
                        10,
                    );
                    // Mark as completed with full metadata (extends TTL to 7 days)
                    await markSessionProcessed(c.env.KV, session.id, {
                        userId: session.metadata.userId || "",
                        units: pollenPaid,
                        packSlug: session.metadata.packSlug || "unknown",
                    });

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
                    // Release lock on failure to allow Stripe retry
                    await releaseSessionLock(c.env.KV, session.id);
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
