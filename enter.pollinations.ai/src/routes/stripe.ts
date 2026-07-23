import {
    describePollenPack,
    getPollenPackByKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { getCohortFromCountry } from "../utils/currency-router.ts";
import {
    createBillingPortalSession,
    getBillingOverview,
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "../utils/stripe-billing.ts";
import { createPackCheckoutSession } from "../utils/stripe-checkout.ts";
import { stripeTopUpRoutes } from "./stripe-top-up.ts";

/**
 * Stripe pack configuration
 * Checkout keeps pack pricing USD-native and lets Stripe Adaptive Pricing
 * localize buyer presentment where supported.
 */
export const stripeRoutes = new Hono<Env>()
    .route("/", stripeTopUpRoutes)
    /**
     * GET /api/stripe/checkout/:packKey
     * Create a Stripe Checkout Session for pack purchases.
     *
     * Path parameter is the pack key ("p2".."p100"). The legacy USD-amount
     * form ("2".."100") is no longer accepted — all first-party callers and
     * the /products endpoint expose packKey.
     *
     * Cohort routing (Phase 1): CF-IPCountry → CohortId for analytics.
     * Stripe Adaptive Pricing localizes presentment.
     *
     * Pollen is the canonical unit: 1 pollen ≈ $1. Checkout sends USD
     * price_data and Stripe AP handles currency conversion.
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

        // Return checkout sessions to the Pollen page for this environment.
        const baseUrl =
            c.env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production;
        const pollenUrl = new URL("/pollen", baseUrl);
        pollenUrl.searchParams.set("pack", pack.packKey);
        const pollenReturnUrl = pollenUrl.toString();

        // Resolve cohort from buyer IP for analytics. Checkout stays USD-native
        // and does not call FX at runtime.
        const cohort = getCohortFromCountry(c.req.header("cf-ipcountry"));
        // Fail closed if the checkout PMC env var is missing. The alternative
        // would silently fall back to Stripe's account default PMC.
        if (!c.env.STRIPE_PMC) {
            console.error(
                `Missing required env var STRIPE_PMC for checkout on ${c.env.ENVIRONMENT}`,
            );
            return c.json({ error: "Checkout configuration error" }, 500);
        }
        try {
            const checkoutSession = await createPackCheckoutSession({
                env: c.env,
                userId,
                pack,
                cohort,
                mode: "customer",
                successUrl: `${pollenReturnUrl}&stripe_success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${pollenReturnUrl}&stripe_canceled=true`,
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
