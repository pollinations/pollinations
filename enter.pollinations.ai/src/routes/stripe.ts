import { ACCOUNT_RESTRICTED_MESSAGE, isUserBanned } from "@shared/auth/ban.ts";
import {
    calculateServiceFeeCents,
    describePollenPack,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    SERVICE_FEE_NAME,
    SERVICE_FEE_TAX_CODE,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type Stripe from "stripe";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { getCohortFromCountry } from "../utils/currency-router.ts";
import {
    captureFromRequest,
    referringSource,
} from "../utils/product-analytics.ts";
import { createStripeClient } from "../utils/stripe.ts";
import {
    getStripeId,
    getUserStripeBillingRow,
} from "../utils/stripe-billing/customer.ts";
import {
    createBillingPortalSession,
    getBillingOverview,
    getOrCreateStripeCustomerId,
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "../utils/stripe-billing/index.ts";
import {
    getStripeNewCardGateStatus,
    stripeNewCardGateMetadata,
} from "../utils/stripe-card-gate.ts";
import { expireOpenStripeCheckoutSessions } from "../utils/stripe-fraud-ban.ts";

/**
 * Stripe pack configuration
 * Checkout keeps pack pricing USD-native and lets Stripe Adaptive Pricing
 * localize buyer presentment where supported.
 */
export const stripeRoutes = new Hono<Env>()
    /**
     * GET /api/stripe/checkout/:packKey
     * Redirect to hosted Stripe Checkout for a pack: first card payments,
     * new cards and every method the pay modal doesn't show.
     */
    .get("/checkout/:packKey", async (c) => {
        const session = await createPackCheckoutSession(c, "hosted");
        if (session instanceof Response) return session;
        // Redirect to Stripe Checkout (will use checkout.pollinations.ai custom domain)
        return c.redirect(session.url as string);
    })

    /**
     * POST /api/stripe/checkout/:packKey/session
     * The same Checkout Session for the wallet's pay modal: our own screen,
     * with Stripe.js paying through the buyer's saved card.
     */
    .post("/checkout/:packKey/session", async (c) => {
        const session = await createPackCheckoutSession(c, "elements");
        if (session instanceof Response) return session;
        return c.json({
            clientSecret: session.client_secret as string,
            sessionId: session.id,
            publishableKey: c.env.STRIPE_PUBLISHABLE_KEY,
        });
    })

    /**
     * GET /api/stripe/checkout/sessions/:sessionId
     * Where the signed-in buyer's own pack purchase stands, so the wallet can
     * say "added" only once the webhook credited it.
     */
    .get("/checkout/sessions/:sessionId", async (c) => {
        const user = await requireSessionUser(c);
        const sessionId = c.req.param("sessionId");

        const credit = await c.env.DB.prepare(
            "SELECT pollen_credited FROM stripe_checkout_credits WHERE session_id = ? AND user_id = ?",
        )
            .bind(sessionId, user.id)
            .first<{ pollen_credited: number }>();
        if (credit) {
            return c.json({
                status: "credited" as const,
                pollen: credit.pollen_credited,
            });
        }

        const stripe = createStripeClient(c.env);
        const session = sessionId.startsWith("cs_")
            ? await stripe.checkout.sessions
                  .retrieve(sessionId)
                  .catch((error) => {
                      if (error?.code === "resource_missing") return null;
                      throw error;
                  })
            : null;
        // Another user's session looks the same as a missing one.
        if (!session || session.metadata?.userId !== user.id) {
            return c.json({ error: "Checkout session not found" }, 404);
        }
        if (session.status === "expired") {
            return c.json({ status: "expired" as const });
        }
        // Checkout completes before a bank payment (SEPA, Multibanco)
        // settles; if the bank then refuses it, the payment falls back to
        // needing a method (or is canceled), and nothing will be credited.
        // Still processing or awaiting authentication stays pending.
        const paymentIntentId = getStripeId(session.payment_intent);
        if (
            session.status === "complete" &&
            session.payment_status === "unpaid" &&
            paymentIntentId
        ) {
            const payment =
                await stripe.paymentIntents.retrieve(paymentIntentId);
            if (
                payment.status === "requires_payment_method" ||
                payment.status === "canceled"
            ) {
                return c.json({ status: "failed" as const });
            }
        }
        // Otherwise it is on its way: the webhook has not credited it yet,
        // or the payment is still settling.
        return c.json({ status: "pending" as const });
    })

    /**
     * GET /api/stripe/products
     * List available packs. Returns packKey (canonical identifier for the
     * /checkout/:packKey route) plus the USD amount for display.
     */
    .get("/products", async (c) => {
        return c.json({
            packs: POLLEN_PACKS.map((pack) => ({
                packKey: pack.packKey,
                amount: pack.amountUsd,
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
        return c.json({
            ...(await getBillingOverview(c.env, user.id)),
            ipCountry: c.req.header("cf-ipcountry") ?? null,
        });
    })

    /**
     * POST /api/stripe/billing/portal
     * Create a Stripe Customer Portal session for billing management.
     * `flow: "card"` opens adding a card (made the default), `flow:
     * "details"` the billing details; either returns once it is done.
     * Without it, the portal's home page.
     */
    .post("/billing/portal", async (c) => {
        const user = await requireSessionUser(c);

        const body = (await c.req.json().catch(() => null)) as {
            return?: unknown;
            redirect?: unknown;
            flow?: unknown;
            pack?: unknown;
        } | null;

        try {
            const session = await createBillingPortalSession(
                c.env,
                user.id,
                {
                    topUp: body?.return === "top-up",
                    redirect:
                        typeof body?.redirect === "string"
                            ? body.redirect
                            : undefined,
                    pack:
                        typeof body?.pack === "string" &&
                        isPollenPackKey(body.pack)
                            ? body.pack
                            : undefined,
                },
                body?.flow === "card" || body?.flow === "details"
                    ? body.flow
                    : undefined,
            );

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
        captureFromRequest(
            c,
            body.enabled ? "auto_top_up_enabled" : "auto_top_up_disabled",
            user.id,
            { amount_usd: body.packAmountUsd },
        );

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

/**
 * How the session is shown: Stripe's hosted page, or our pay modal
 * (`elements`: the saved card, rendered by Stripe.js).
 */
type CheckoutUiMode = "hosted" | "elements";

/**
 * Create a pack Checkout Session for the signed-in buyer. Every UI mode
 * shares pricing, fees, tax, metadata, and buyer checks. The hosted crypto
 * link selects only crypto and keeps USD pricing. Returns an error response
 * or a session with a url (hosted) or client_secret (in the wallet).
 *
 * Path parameter is the pack key ("p2".."p100"). Pollen is the canonical
 * unit: 1 pollen ≈ $1. Checkout sends USD price_data; Stripe Adaptive
 * Pricing may localize the regular checkout. CF-IPCountry → CohortId for analytics.
 */
async function createPackCheckoutSession(
    c: Context<Env>,
    uiMode: CheckoutUiMode,
): Promise<Response | Stripe.Checkout.Session> {
    const pack = getPollenPackByKey(c.req.param("packKey") ?? "");
    const cryptoCheckout =
        uiMode === "hosted" && c.req.query("payment_method") === "crypto";

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

    const buyer = await getUserStripeBillingRow(c.env.DB, userId);
    if (isUserBanned(buyer)) {
        if (buyer.stripeCustomerId)
            await expireOpenStripeCheckoutSessions(
                stripe,
                buyer.stripeCustomerId,
            );
        return c.json({ error: ACCOUNT_RESTRICTED_MESSAGE }, 403);
    }

    const pollenUrl = walletReturnUrl(c);
    pollenUrl.searchParams.set("pack", pack.packKey);
    const pollenReturnUrl = pollenUrl.toString();
    const successUrl = `${pollenReturnUrl}&stripe_success=true&session_id={CHECKOUT_SESSION_ID}`;

    // Resolve cohort from buyer IP for analytics. Checkout stays USD-native
    // and does not call FX at runtime.
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
        const newCardGate = await getStripeNewCardGateStatus(c.env.DB, userId);
        // Request 3DS on first purchases and small packs. Successful
        // authentication can shift fraud liability; requesting it alone does
        // not guarantee authentication or eliminate dispute fees.
        const priorCredit = await c.env.DB.prepare(
            "SELECT 1 FROM stripe_checkout_credits WHERE user_id = ? LIMIT 1",
        )
            .bind(userId)
            .first();
        const requestThreeDSecure = !priorCredit || pack.amountUsd < 10;

        // packKey identifies the pack; the webhook looks up its fixed USD
        // amount to credit, independent of how Adaptive Pricing may localize the
        // presentment currency.
        const packMetadata = {
            userId,
            packKey: pack.packKey,
            cohort,
            ...stripeNewCardGateMetadata(newCardGate),
        };
        const serviceFeeCents = calculateServiceFeeCents(pack.amountUsd * 100);

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "payment",
            ...(cryptoCheckout
                ? { payment_method_types: ["crypto"] as const }
                : { payment_method_configuration: pmcId }),
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        unit_amount: pack.amountUsd * 100,
                        tax_behavior: "exclusive",
                        product_data: {
                            name: pack.checkoutName,
                            description: pack.checkoutDescription,
                            images: [pack.checkoutImageUrl],
                            tax_code: pack.taxCode,
                        },
                    },
                    quantity: 1,
                },
                {
                    price_data: {
                        currency: "usd",
                        unit_amount: serviceFeeCents,
                        tax_behavior: "exclusive",
                        product_data: {
                            name: SERVICE_FEE_NAME,
                            tax_code: SERVICE_FEE_TAX_CODE,
                        },
                    },
                    quantity: 1,
                },
            ],
            adaptive_pricing: { enabled: !cryptoCheckout },
            ...(requestThreeDSecure &&
                !cryptoCheckout && {
                    payment_method_options: {
                        card: { request_three_d_secure: "any" },
                    },
                }),
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
            // Optional "save for future purchases" checkbox. Saved cards are
            // prefilled on the buyer's next checkout.
            ...(!cryptoCheckout && {
                saved_payment_method_options: {
                    payment_method_save: "enabled",
                },
            }),
            payment_intent_data: {
                metadata: packMetadata,
            },
            // Invoice creation after payment
            invoice_creation: {
                enabled: true,
                invoice_data: {
                    rendering_options: {
                        amount_tax_display: "exclude_tax",
                    },
                },
            },
            metadata: packMetadata,
            ...(uiMode === "hosted"
                ? {
                      success_url: successUrl,
                      cancel_url: `${pollenReturnUrl}&stripe_canceled=true`,
                  }
                : {
                      // Payments finish inside the modal; only methods that
                      // need a redirect come back through return_url.
                      ui_mode: "elements",
                      return_url: successUrl,
                  }),
        });

        if (isUserBanned(await getUserStripeBillingRow(c.env.DB, userId))) {
            await expireOpenStripeCheckoutSessions(stripe, stripeCustomerId);
            return c.json({ error: ACCOUNT_RESTRICTED_MESSAGE }, 403);
        }
        const ready =
            uiMode === "hosted"
                ? checkoutSession.url
                : checkoutSession.client_secret;
        if (!ready) {
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
        captureFromRequest(c, "checkout_started", userId, {
            pack_key: pack.packKey,
            // Where the buyer came from, so checkouts divide by views of that
            // same page, as sign-ins already do.
            ...referringSource(c.req.raw.headers, c.env.BETTER_AUTH_URL),
        });
        return checkoutSession;
    } catch (error) {
        // Log full error server-side for debugging
        console.error("Stripe checkout error:", error);
        // Return generic message to client - don't expose internal error details
        return c.json({ error: "Failed to create checkout session" }, 500);
    }
}

/**
 * Where Stripe sends the buyer back: the standalone top-up page when they
 * started there, else the Pollen dashboard. Both paths are fixed here, so the
 * return URL is always on this origin.
 */
function walletReturnUrl(c: Context<Env>): URL {
    const url = new URL(
        c.req.query("return") === "top-up" ? "/top-up" : "/pollen",
        c.env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production,
    );
    const appRedirect = c.req.query("redirect");
    if (appRedirect) url.searchParams.set("redirect", appRedirect);
    return url;
}

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
