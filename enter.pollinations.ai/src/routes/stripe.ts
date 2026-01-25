import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { createStripeClient } from "../utils/stripe.ts";

/**
 * Stripe pack products configuration
 * Maps pack names to Stripe Price IDs
 * Pollen amount is derived from payment amount ($1 = 1 pollen)
 */
const getPackPrices = (env: CloudflareBindings) => {
    const isProduction = env.STRIPE_MODE === "live";

    if (isProduction) {
        return {
            "5": "price_1Srl1z7rcjS3l7tr0Y971QxA",
            "10": "price_1Srl5P7rcjS3l7treLbAZocj",
            "20": "price_1Srl667rcjS3l7trUByzhPHy",
            "50": "price_1Srl6e7rcjS3l7trBUDAOq1M",
        } as const;
    }

    // Sandbox/test mode
    return {
        "5": "price_1Srl9o6O03AauPe8Px6vwI7F",
        "10": "price_1SrlAS6O03AauPe8TxLBePFg",
        "20": "price_1SrlBH6O03AauPe8ynkEaJeH",
        "50": "price_1SrlBu6O03AauPe8KCklipVK",
    } as const;
};

type PackAmount = "5" | "10" | "20" | "50";

const isValidPackAmount = (amount: string): amount is PackAmount => {
    return ["5", "10", "20", "50"].includes(amount);
};

export const stripeRoutes = new Hono<Env>()
    /**
     * GET /api/stripe/checkout/:amount
     * Create a Stripe Checkout Session for pack purchases
     * Amount is in USD (5, 10, 20, 50)
     */
    .get("/checkout/:amount", async (c) => {
        const amount = c.req.param("amount");

        if (!isValidPackAmount(amount)) {
            return c.json({ error: "Invalid pack amount" }, 400);
        }

        // Get authenticated user
        const auth = createAuth(c.env, c.executionCtx);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session?.user?.id) {
            return c.json({ error: "Authentication required" }, 401);
        }

        const userId = session.user.id;
        const userEmail = session.user.email;

        // Get price ID for this amount
        const packPrices = getPackPrices(c.env);
        const priceId = packPrices[amount];

        // Create Stripe client
        const stripe = createStripeClient(c.env);

        // Determine success URL based on environment
        const successUrl =
            c.env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
        const cancelUrl = successUrl;

        try {
            // Create Checkout Session with automatic tax, VAT, and invoice creation
            // Pollen amount is derived from payment amount in webhook ($1 = 1 pollen)
            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "payment",
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                // Enable discount/promotion codes
                allow_promotion_codes: true,
                // Automatic tax & VAT
                automatic_tax: { enabled: true },
                // Auto billing address - collects only what's needed (country for tax)
                billing_address_collection: "auto",
                // Optional VAT/Tax ID collection for businesses (not enforced)
                tax_id_collection: { enabled: true },
                // Always create customer for invoicing
                customer_creation: "always",
                customer_email: userEmail,
                // Invoice creation after payment
                invoice_creation: {
                    enabled: true,
                },
                // Metadata for webhook processing - only userId needed
                // Pollen amount derived from session.amount_subtotal (before tax)
                metadata: {
                    userId,
                },
                success_url: `${successUrl}?stripe_success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${cancelUrl}?stripe_canceled=true`,
            });

            // Redirect to Stripe Checkout (will use checkout.pollinations.ai custom domain)
            if (checkoutSession.url) {
                return c.redirect(checkoutSession.url);
            }

            return c.json({ error: "Failed to create checkout session" }, 500);
        } catch (error) {
            // Log full error server-side for debugging
            console.error("Stripe checkout error:", error);
            // Return generic message to client - don't expose internal error details
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
    })

    /**
     * GET /api/stripe/products
     * List available pack amounts
     */
    .get("/products", async (c) => {
        const packPrices = getPackPrices(c.env);

        return c.json({
            packs: Object.keys(packPrices).map((amount) => ({
                amount: Number(amount),
                description: `$${amount} → ${amount} Pollen`,
            })),
        });
    });
