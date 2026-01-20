import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type Stripe from "stripe";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import {
    createStripeClient,
    isSessionProcessed,
    markSessionProcessed,
    verifyWebhookSignature,
} from "../utils/stripe.ts";

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

    // BETA PROMOTION: Double all pack purchases (remove after beta)
    const BETA_MULTIPLIER = 2;
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
                    // Idempotency check - prevent duplicate credits on webhook retry
                    if (await isSessionProcessed(c.env.KV, session.id)) {
                        console.log(
                            `Stripe: Session ${session.id} already processed, skipping`,
                        );
                        break;
                    }

                    const result = await handleCheckoutSessionCompleted(
                        session,
                        c.env,
                    );

                    // Mark as processed after successful credit
                    if (result.success && session.metadata) {
                        await markSessionProcessed(c.env.KV, session.id, {
                            userId: session.metadata.userId || "",
                            units: Number.parseInt(
                                session.metadata.units || "0",
                                10,
                            ),
                            packSlug: session.metadata.packSlug || "unknown",
                        });
                    }

                    if (!result.success) {
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

                // Idempotency check
                if (await isSessionProcessed(c.env.KV, session.id)) {
                    console.log(
                        `Stripe: Async session ${session.id} already processed, skipping`,
                    );
                    break;
                }

                const result = await handleCheckoutSessionCompleted(
                    session,
                    c.env,
                );

                // Mark as processed after successful credit
                if (result.success && session.metadata) {
                    await markSessionProcessed(c.env.KV, session.id, {
                        userId: session.metadata.userId || "",
                        units: Number.parseInt(
                            session.metadata.units || "0",
                            10,
                        ),
                        packSlug: session.metadata.packSlug || "unknown",
                    });
                }

                if (!result.success) {
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
                // No action needed - session was not completed
                break;
            }

            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }

        // Always return 200 to acknowledge receipt
        return c.json({ received: true });
    });
