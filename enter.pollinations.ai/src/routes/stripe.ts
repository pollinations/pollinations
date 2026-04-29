import { Hono } from "hono";
import {
    describePollenPack,
    getPollenPack,
    isPollenPackAmount,
    POLLEN_PACKS,
} from "@/pollen-packs.ts";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { createStripeClient } from "../utils/stripe.ts";
import {
    type BillingProfileInput,
    COUNTRY_OPTIONS,
    createPaymentMethodSetupSession,
    detachUserPaymentMethod,
    getBillingState,
    getOrCreateStripeCustomerId,
    setDefaultUserPaymentMethod,
    stripeFieldErrors,
    updateBillingProfile,
} from "../utils/stripe-billing.ts";

/**
 * Stripe pack configuration
 * Checkout copy and payout are controlled in-app so bonus changes do not
 * require Stripe catalog edits.
 */
export const stripeRoutes = new Hono<Env>()
    /**
     * GET /api/stripe/billing/countries
     * Static ISO country list with Stripe-supported tax ID metadata.
     */
    // Public: keep this before the authenticated billing middleware below.
    .get("/billing/countries", (c) => {
        c.header("Cache-Control", "public, max-age=86400, immutable");
        return c.json({ countries: COUNTRY_OPTIONS });
    })
    .use("/billing", auth({ allowApiKey: false, allowSessionCookie: true }))
    .use("/billing/*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .use(
        "/payment-methods/*",
        auth({ allowApiKey: false, allowSessionCookie: true }),
    )
    /**
     * GET /api/stripe/checkout/:amount
     * Create a Stripe Checkout Session for pack purchases
     * Amount is in USD (2, 5, 10, 20, 50, 100)
     */
    .get("/checkout/:amount", async (c) => {
        const amount = c.req.param("amount");

        if (!isPollenPackAmount(amount)) {
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

        const pack = getPollenPack(amount);

        if (!pack) {
            return c.json({ error: "Invalid pack amount" }, 400);
        }

        const stripeCustomerId = await getOrCreateStripeCustomerId(
            c.env,
            userId,
        );

        // Create Stripe client
        const stripe = createStripeClient(c.env);

        // Determine success URL based on environment
        const successUrl =
            c.env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
        const cancelUrl = successUrl;

        try {
            // Create Checkout Session with automatic tax, VAT, and invoice creation
            // Checkout copy is derived from the shared pack catalog so it stays
            // in sync with the credited pollen amount.
            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            unit_amount: pack.amountUsd * 100,
                            tax_behavior: "inclusive",
                            product_data: {
                                name: pack.checkoutName,
                                description: pack.checkoutDescription,
                                images: [pack.checkoutImageUrl],
                                tax_code: pack.taxCode,
                            },
                        },
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
                customer: stripeCustomerId,
                customer_update: {
                    address: "auto",
                    name: "auto",
                },
                payment_intent_data: {
                    metadata: {
                        userId,
                        packAmount: String(pack.amountUsd),
                    },
                },
                // Invoice creation after payment
                invoice_creation: {
                    enabled: true,
                    invoice_data: {
                        rendering_options: {
                            amount_tax_display: "include_inclusive_tax",
                        },
                    },
                },
                // Metadata links the completed checkout back to the shared pack
                // definition used by the webhook.
                metadata: {
                    userId,
                    packAmount: String(pack.amountUsd),
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
        return c.json({
            packs: POLLEN_PACKS.map((pack) => ({
                amount: pack.amountUsd,
                bonusPollen: pack.bonusPollen,
                pollenGrant: pack.pollenGrant,
                description: describePollenPack(pack),
            })),
        });
    })

    /**
     * GET /api/stripe/billing
     * Return Stripe-backed billing profile, cards, and paginated invoices.
     */
    .get("/billing", async (c) => {
        const user = c.var.auth.requireUser();
        const billing = await getBillingState(
            c.env,
            user.id,
            c.req.query("invoice_cursor"),
        );
        return c.json(billing);
    })

    /**
     * PATCH /api/stripe/billing/profile
     * Update Stripe Customer billing profile and tax ID.
     */
    .patch("/billing/profile", async (c) => {
        const user = c.var.auth.requireUser();
        const body = await c.req.text();
        if (body.length > 16_384) {
            return c.json({ error: "Billing profile is too large" }, 413);
        }
        const input = JSON.parse(body) as BillingProfileInput;

        try {
            const result = await updateBillingProfile(c.env, user.id, input);
            if (!result.ok) {
                return c.json(
                    {
                        error: "Billing profile is invalid",
                        fieldErrors: result.fieldErrors,
                    },
                    400,
                );
            }

            return c.json({ profile: result.profile });
        } catch (error) {
            const fieldErrors = stripeFieldErrors(error);
            if (fieldErrors) {
                return c.json(
                    {
                        error: "Billing profile is invalid",
                        fieldErrors,
                    },
                    400,
                );
            }

            console.error("Stripe billing profile update error:", error);
            return c.json({ error: "Failed to update billing profile" }, 500);
        }
    })

    /**
     * POST /api/stripe/payment-methods/setup
     * Create a Stripe Checkout setup session for adding a card.
     */
    .post("/payment-methods/setup", async (c) => {
        const user = c.var.auth.requireUser();
        const session = await createPaymentMethodSetupSession(c.env, user.id);

        if (!session.url) {
            return c.json(
                { error: "Failed to create payment method setup session" },
                500,
            );
        }

        return c.json({ url: session.url });
    })

    /**
     * DELETE /api/stripe/payment-methods/:id
     * Detach a saved card after verifying ownership.
     */
    .delete("/payment-methods/:id", async (c) => {
        const user = c.var.auth.requireUser();
        const result = await detachUserPaymentMethod(
            c.env,
            user.id,
            c.req.param("id"),
        );

        if (result === "forbidden") {
            return c.json({ error: "Payment method not found" }, 403);
        }

        return c.body(null, 204);
    })

    /**
     * PATCH /api/stripe/payment-methods/:id/default
     * Set a saved card as the Stripe Customer default payment method.
     */
    .patch("/payment-methods/:id/default", async (c) => {
        const user = c.var.auth.requireUser();
        const result = await setDefaultUserPaymentMethod(
            c.env,
            user.id,
            c.req.param("id"),
        );

        if (result === "forbidden") {
            return c.json({ error: "Payment method not found" }, 403);
        }

        return c.json({ ok: true });
    });
