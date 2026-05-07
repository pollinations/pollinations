import { Hono } from "hono";
import {
    describePollenPack,
    getPollenPack,
    isPollenPackAmount,
    POLLEN_PACKS,
} from "@/pollen-packs.ts";
import { createAuth } from "../auth.ts";
import {
    ONE_TIME_CONSENT_MESSAGE,
    ONE_TIME_CONSENT_VERSION,
} from "../checkout-consent.ts";
import type { Env } from "../env.ts";
import { createStripeClient } from "../utils/stripe.ts";

/**
 * Stripe pack configuration
 * Checkout copy and payout are controlled in-app so bonus changes do not
 * require Stripe catalog edits.
 */
export const stripeRoutes = new Hono<Env>()
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
        const userEmail = session.user.email;

        const pack = getPollenPack(amount);

        if (!pack) {
            return c.json({ error: "Invalid pack amount" }, 400);
        }

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
                // Always create customer for invoicing
                customer_creation: "always",
                customer_email: userEmail,
                // Required terms-of-service checkbox carries the immediate-
                // delivery waiver: EU/EEA consumers expressly request immediate
                // provisioning and acknowledge loss of the 14-day withdrawal
                // right once Pollen is credited.
                consent_collection: {
                    terms_of_service: "required",
                },
                custom_text: {
                    terms_of_service_acceptance: {
                        message: ONE_TIME_CONSENT_MESSAGE,
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
                // definition used by the webhook. consentVersion pins the
                // session to the exact consent text the user saw.
                metadata: {
                    userId,
                    packAmount: String(pack.amountUsd),
                    consentVersion: ONE_TIME_CONSENT_VERSION,
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
    });
