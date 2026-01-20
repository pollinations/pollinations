import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { createStripeClient } from "../utils/stripe.ts";

/**
 * Stripe pack products configuration
 * Maps pack slugs to Stripe Price IDs and pollen amounts
 */
const getPackProducts = (env: CloudflareBindings) => {
    const isProduction = env.STRIPE_MODE === "live";

    if (isProduction) {
        return {
            "5x2": { priceId: "price_1SrYRT7rcjS3l7trZ4avkKfQ", units: 5 },
            "10x2": { priceId: "price_1SrYQY7rcjS3l7trCwMCtXFC", units: 10 },
            "20x2": { priceId: "price_1SrYQ57rcjS3l7trH9Zy11pe", units: 20 },
            "50x2": { priceId: "price_1SrYP07rcjS3l7trmxevdD0N", units: 50 },
        } as const;
    }

    // Sandbox/test mode
    return {
        "5x2": { priceId: "price_1SrYXu6O03AauPe8hkg41tEu", units: 5 },
        "10x2": { priceId: "price_1SrYXM6O03AauPe8VfRDtPtE", units: 10 },
        "20x2": { priceId: "price_1SrYUL6O03AauPe8kJZG8Zdg", units: 20 },
        "50x2": { priceId: "price_1SrYTz6O03AauPe8lFPr2fCS", units: 50 },
    } as const;
};

type PackSlug = "5x2" | "10x2" | "20x2" | "50x2";

const isValidPackSlug = (slug: string): slug is PackSlug => {
    return ["5x2", "10x2", "20x2", "50x2"].includes(slug);
};

export const stripeRoutes = new Hono<Env>()
    /**
     * GET /api/stripe/checkout/:slug
     * Create a Stripe Checkout Session for pack purchases
     */
    .get("/checkout/:slug", async (c) => {
        const slug = c.req.param("slug");

        if (!isValidPackSlug(slug)) {
            return c.json({ error: "Invalid pack slug" }, 400);
        }

        // Get authenticated user
        const auth = createAuth(c.env);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session?.user?.id) {
            return c.json({ error: "Authentication required" }, 401);
        }

        const userId = session.user.id;
        const userEmail = session.user.email;

        // Get pack product info
        const packProducts = getPackProducts(c.env);
        const pack = packProducts[slug];

        // Create Stripe client
        const stripe = createStripeClient(c.env);

        // Determine success URL based on environment
        const successUrl =
            c.env.STRIPE_SUCCESS_URL ||
            c.env.POLAR_SUCCESS_URL ||
            "https://enter.pollinations.ai";
        const cancelUrl = successUrl;

        try {
            // Create Checkout Session with automatic tax, VAT, and invoice creation
            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "payment",
                line_items: [
                    {
                        price: pack.priceId,
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
                // Metadata for webhook processing
                metadata: {
                    userId,
                    packSlug: slug,
                    units: String(pack.units),
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
            console.error("Stripe checkout error:", error);
            return c.json(
                {
                    error: "Failed to create checkout session",
                    details:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                },
                500,
            );
        }
    })

    /**
     * GET /api/stripe/products
     * List available pack products
     */
    .get("/products", async (c) => {
        const packProducts = getPackProducts(c.env);

        return c.json({
            packs: Object.entries(packProducts).map(([slug, pack]) => ({
                slug,
                units: pack.units,
                description: `${pack.units} Pollen`,
            })),
        });
    });
