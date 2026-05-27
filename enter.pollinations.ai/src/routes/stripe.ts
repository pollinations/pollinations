import {
    describePollenPack,
    getPollenPackByKey,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type Stripe from "stripe";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { getCohortFromCountry } from "../utils/currency-router.ts";
import { createStripeClient } from "../utils/stripe.ts";
import {
    createBillingPortalSession,
    getBillingOverview,
    getOrCreateStripeCustomerId,
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "../utils/stripe-billing.ts";

/**
 * Stripe pack configuration
 * Checkout uses managed Stripe Prices keyed from the shared pack catalog.
 * Run scripts/sync-stripe-pollen-prices.ts after pack copy or amount changes.
 */
export const stripeRoutes = new Hono<Env>()
    /**
     * GET /api/stripe/checkout/:packKey
     * Create a Stripe Checkout Session for pack purchases.
     *
     * Path parameter is the pack key ("p2".."p100").
     *
     * Cohort routing (Phase 1): CF-IPCountry → CheckoutCohort decides whether
     * Stripe Adaptive Pricing localizes presentment.
     *
     * Pollen is the canonical unit: 1 pollen ≈ $1. Checkout references a
     * managed Stripe Price by lookup key; explicit Price currency_options
     * cover EUR/GBP/INR, and Stripe AP (when on) can localize the rest.
     */
    .get("/checkout/:packKey", async (c) => {
        const packKeyParam = c.req.param("packKey");
        const pack = getPollenPackByKey(packKeyParam);

        if (!pack) {
            return c.json({ error: "Invalid pack" }, 400);
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

        // Create Stripe client
        const stripe = createStripeClient(c.env);

        // Determine success URL based on environment
        const successUrl =
            c.env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production;
        const cancelUrl = successUrl;

        // Resolve cohort from buyer IP. The managed Stripe Price carries the
        // actual currency amounts, so checkout does not call FX at runtime.
        const cohort = getCohortFromCountry(c.req.header("cf-ipcountry"));
        // Fail closed if the checkout PMC env var is missing. The alternative
        // (omit payment_method_configuration → Stripe falls back to account
        // default PMC) would hide a misconfigured deploy.
        const pmcId = c.env.STRIPE_PMC;
        if (!pmcId) {
            console.error(
                `Missing required env var STRIPE_PMC for checkout on ${c.env.ENVIRONMENT}`,
            );
            return c.json({ error: "Checkout configuration error" }, 500);
        }

        try {
            const stripeCustomerId = await getOrCreateStripeCustomerId(
                c.env,
                userId,
            );

            // Snapshot of pack identity + grant at session creation time. The
            // webhook reads this back to credit exactly what the user saw,
            // independent of how Adaptive Pricing localized the presentment.
            const packMetadata = {
                userId,
                packKey: pack.packKey,
                packAmountUsd: String(pack.amountUsd),
                packPollenGrant: String(pack.pollenGrant),
                packBonusPollen: String(pack.bonusPollen),
                cohort: cohort.id,
            };
            const priceId = await resolvePollenPackStripePrice(stripe, pack);

            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "payment",
                payment_method_configuration: pmcId,
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                adaptive_pricing: { enabled: cohort.adaptivePricing },
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
                    metadata: packMetadata,
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
                metadata: packMetadata,
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
     * Return Stripe Portal-backed billing and auto top-up state.
     */
    .get("/billing", async (c) => {
        const user = await requireSessionUser(c);
        return c.json(await getBillingOverview(c.env, user.id));
    })

    /**
     * POST /api/stripe/billing/portal
     * Create a Stripe Customer Portal session for billing management.
     */
    .post("/billing/portal", async (c) => {
        const user = await requireSessionUser(c);

        try {
            const session = await createBillingPortalSession(c.env, user.id);

            if (!session.url) {
                return c.json(
                    { error: "Failed to create billing portal session" },
                    500,
                );
            }

            return c.json({ url: session.url });
        } catch (error) {
            console.error("Stripe billing portal error:", error);
            return c.json(
                {
                    error: normalizeStripePortalError(error),
                },
                500,
            );
        }
    })

    /**
     * PATCH /api/stripe/auto-top-up
     * Save current user's auto top-up preferences. Charging is triggered by
     * the internal usage flow after future billing deductions, not on enable.
     */
    .patch("/auto-top-up", async (c) => {
        const user = await requireSessionUser(c);
        const body = (await c.req.json().catch(() => null)) as {
            enabled?: boolean;
            packAmountUsd?: number;
        } | null;

        if (!body || typeof body.enabled !== "boolean") {
            return c.json({ error: "enabled must be boolean" }, 400);
        }

        if (
            body.enabled &&
            (typeof body.packAmountUsd !== "number" ||
                !Number.isFinite(body.packAmountUsd))
        ) {
            return c.json(
                { error: "packAmountUsd must be a finite number" },
                400,
            );
        }

        const result = await updateAutoTopUpSettings(c.env, user.id, {
            enabled: body.enabled,
            packAmountUsd: body.packAmountUsd,
        });

        if (!result.ok) {
            return c.json({ error: result.error }, result.status);
        }

        return c.json(result.overview);
    })

    /**
     * POST /api/stripe/auto-top-up/trigger
     * Internal endpoint called by gen after billing deductions.
     */
    .post("/auto-top-up/trigger", async (c) => {
        if (!(await isInternalRequest(c.req.raw, c.env))) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const body = (await c.req.json().catch(() => ({}))) as {
            userId?: string;
            environment?: string;
        };
        if (!body.userId) {
            return c.json({ error: "Missing userId" }, 400);
        }
        if (body.environment !== c.env.ENVIRONMENT) {
            return c.json({ error: "Environment mismatch" }, 401);
        }

        return c.json(await processAutoTopUpForUser(c.env, body.userId));
    });

async function requireSessionUser(c: Context<Env>) {
    const auth = createAuth(c.env, c.executionCtx);
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
        throw new HTTPException(401, {
            message: "Authentication required",
        });
    }

    return session.user;
}

async function isInternalRequest(
    request: Request,
    env: CloudflareBindings,
): Promise<boolean> {
    const expectedToken = env.PLN_ENTER_TOKEN;
    if (!expectedToken || expectedToken.length < 32) return false;

    const header = request.headers.get("Authorization") ?? "";
    if (!header.startsWith("Bearer ")) return false;

    const presentedToken = header.slice("Bearer ".length);
    const [presentedDigest, expectedDigest] = await Promise.all([
        sha256Utf8(presentedToken),
        sha256Utf8(expectedToken),
    ]);
    return constantTimeBytesEqual(presentedDigest, expectedDigest);
}

async function sha256Utf8(value: string): Promise<Uint8Array> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(digest);
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;

    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) {
        mismatch |= left[index] ^ right[index];
    }
    return mismatch === 0;
}

function normalizeStripePortalError(error: unknown): string {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "";

    if (message.toLowerCase().includes("configuration")) {
        return "Stripe Billing Portal is not configured for this Stripe account.";
    }

    return message || "Failed to create billing portal session";
}

async function resolvePollenPackStripePrice(
    stripe: Stripe,
    pack: PollenPack,
): Promise<string> {
    const prices = await stripe.prices.list({
        active: true,
        lookup_keys: [pack.stripeLookupKey],
        limit: 1,
    });
    const price = prices.data[0];

    if (!price) {
        throw new Error(
            `Missing active Stripe Price for lookup key ${pack.stripeLookupKey}`,
        );
    }

    return price.id;
}
