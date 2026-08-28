import { getRealClientIp, hashIp } from "@shared/client-ip.ts";
import {
    isValidPollenGiftAmount,
    POLLEN_GIFT_AMOUNTS,
    POLLEN_GIFT_PACKS,
    POLLEN_GIFT_PURPOSE,
} from "@shared/pollen-gifts.ts";
import {
    SERVICE_FEE_NAME,
    SERVICE_FEE_TAX_CODE,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { type AuthVariables, auth } from "../middleware/auth.ts";
import {
    attachPollenGiftCheckoutSession,
    canRevealPollenGiftCode,
    createPendingPollenGift,
    redeemPollenGift,
    voidPendingPollenGift,
} from "../services/pollen-gifts.ts";
import {
    consumePollenGiftRateLimit,
    getStripeGiftCardGateStatus,
    POLLEN_GIFT_BUYER_KEY_METADATA,
} from "../utils/pollen-gift-security.ts";
import { createStripeClient } from "../utils/stripe.ts";
import { stripeNewCardGateMetadata } from "../utils/stripe-card-gate.ts";

type PollenGiftEnv = {
    Bindings: Env["Bindings"];
    Variables: Env["Variables"] & AuthVariables;
};

const CHECKOUT_RATE_LIMIT = 5;
const CHECKOUT_RATE_WINDOW_MS = 60 * 1000;
const REDEEM_RATE_LIMIT = 10;
const REDEEM_RATE_WINDOW_MS = 10 * 60 * 1000;
const INVALID_GIFT_MESSAGE = "This gift code is invalid or unavailable.";

export const pollenGiftRoutes = new Hono<PollenGiftEnv>()
    .post("/checkout", async (c) => {
        c.header("Cache-Control", "no-store");
        const body = (await c.req.json().catch(() => null)) as {
            amount?: unknown;
        } | null;
        const amount = body?.amount;
        if (!isValidPollenGiftAmount(amount)) {
            return c.json(
                {
                    error: `Choose one of these gift amounts: ${POLLEN_GIFT_AMOUNTS.join(", ")} Pollen.`,
                },
                400,
            );
        }

        const ipHash = await hashIp(
            getRealClientIp(c),
            c.env.BETTER_AUTH_SECRET,
        );
        const buyerKey = ipHash ?? "unknown";
        const checkoutLimit = await consumePollenGiftRateLimit(c.env.DB, {
            key: `checkout:${buyerKey}`,
            limit: CHECKOUT_RATE_LIMIT,
            windowMs: CHECKOUT_RATE_WINDOW_MS,
        });
        if (!checkoutLimit.allowed) {
            return c.json(
                {
                    error: "Too many checkout attempts. Please try again later.",
                },
                429,
                { "Retry-After": String(checkoutLimit.retryAfterSeconds) },
            );
        }

        const cardGate = await getStripeGiftCardGateStatus(c.env.DB, buyerKey);
        if (cardGate.gate === "locked") {
            return c.json(
                {
                    error: "Too many failed payment methods. Please try again later.",
                },
                429,
                { "Retry-After": "86400" },
            );
        }

        const pmcId = c.env.STRIPE_PMC;
        if (!pmcId) {
            console.error("Missing STRIPE_PMC for Pollen gift checkout");
            return c.json({ error: "Checkout configuration error" }, 500);
        }

        const gift = await createPendingPollenGift(c.env.DB, amount).catch(
            (error) => {
                console.error(
                    "Pollen gift order creation failed:",
                    error instanceof Error ? error.message : "unknown error",
                );
                return null;
            },
        );
        if (!gift) {
            return c.json({ error: "Failed to create gift order" }, 500);
        }
        const stripe = createStripeClient(c.env);
        const baseUrl =
            c.env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production;
        const successUrl = new URL("/pollen", baseUrl);
        successUrl.searchParams.set("mode", "gift");
        successUrl.searchParams.set("success", "true");
        const successUrlWithSession = `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = new URL("/pollen", baseUrl);
        cancelUrl.searchParams.set("mode", "gift");
        cancelUrl.searchParams.set("canceled", "true");
        const redeemUrl = new URL("/redeem", baseUrl).toString();
        const packProduct = POLLEN_GIFT_PACKS[0];
        if (!packProduct) {
            await voidPendingPollenGift(c.env.DB, gift.id);
            return c.json({ error: "Checkout configuration error" }, 500);
        }

        try {
            const metadata = {
                purpose: POLLEN_GIFT_PURPOSE,
                giftId: gift.id,
                pollenAmount: String(amount),
                [POLLEN_GIFT_BUYER_KEY_METADATA]: buyerKey,
                ...stripeNewCardGateMetadata(cardGate),
            };
            const checkoutSession = await stripe.checkout.sessions.create(
                {
                    mode: "payment",
                    payment_method_configuration: pmcId,
                    client_reference_id: gift.id,
                    customer_creation: "always",
                    line_items: [
                        {
                            price_data: {
                                currency: "usd",
                                unit_amount: gift.faceValueCents,
                                tax_behavior: "exclusive",
                                product_data: {
                                    name: `🎁 ${amount} Pollen gift`,
                                    description: `Redeem at ${redeemUrl}`,
                                    images: [packProduct.checkoutImageUrl],
                                    tax_code: packProduct.taxCode,
                                },
                            },
                            quantity: 1,
                        },
                        {
                            price_data: {
                                currency: "usd",
                                unit_amount: gift.serviceFeeCents,
                                tax_behavior: "exclusive",
                                product_data: {
                                    name: SERVICE_FEE_NAME,
                                    tax_code: SERVICE_FEE_TAX_CODE,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    adaptive_pricing: { enabled: true },
                    automatic_tax: { enabled: true },
                    billing_address_collection: "required",
                    name_collection: {
                        individual: { enabled: true, optional: false },
                    },
                    phone_number_collection: { enabled: true },
                    tax_id_collection: { enabled: true },
                    payment_intent_data: { metadata },
                    invoice_creation: {
                        enabled: true,
                        invoice_data: {
                            description: `${amount} Pollen gift code`,
                            custom_fields: [
                                { name: "Gift code", value: gift.code },
                            ],
                            footer: `Redeem at ${redeemUrl}`,
                            rendering_options: {
                                amount_tax_display: "exclude_tax",
                            },
                        },
                    },
                    custom_text: {
                        submit: {
                            message:
                                "Your single-use gift code will be included in the paid invoice sent to your email.",
                        },
                    },
                    metadata,
                    success_url: successUrlWithSession,
                    cancel_url: cancelUrl.toString(),
                },
                { idempotencyKey: `pollen-gift:${gift.id}` },
            );

            if (!checkoutSession.url) {
                await voidPendingPollenGift(c.env.DB, gift.id);
                return c.json(
                    { error: "Failed to create checkout session" },
                    500,
                );
            }

            try {
                await attachPollenGiftCheckoutSession(
                    c.env.DB,
                    gift.id,
                    checkoutSession.id,
                );
            } catch (error) {
                await stripe.checkout.sessions
                    .expire(checkoutSession.id)
                    .catch(() => undefined);
                await voidPendingPollenGift(c.env.DB, gift.id);
                throw error;
            }

            return c.json({ url: checkoutSession.url });
        } catch (error) {
            await voidPendingPollenGift(c.env.DB, gift.id);
            console.error(
                `Pollen gift checkout failed for ${gift.id}:`,
                error instanceof Error ? error.message : "unknown error",
            );
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
    })
    .get("/receipt/:sessionId", async (c) => {
        c.header("Cache-Control", "no-store");
        const sessionId = c.req.param("sessionId");
        if (!sessionId.startsWith("cs_")) {
            return c.json({ error: "Gift receipt not found" }, 404);
        }

        const stripe = createStripeClient(c.env);
        const session = await stripe.checkout.sessions
            .retrieve(sessionId, { expand: ["invoice"] })
            .catch(() => null);
        if (
            !session ||
            session.payment_status !== "paid" ||
            session.metadata?.purpose !== POLLEN_GIFT_PURPOSE ||
            !session.metadata.giftId
        ) {
            return c.json({ error: "Gift receipt not found" }, 404);
        }

        const gift = await canRevealPollenGiftCode(c.env.DB, {
            giftId: session.metadata.giftId,
            checkoutSessionId: session.id,
        });
        const invoice =
            session.invoice && typeof session.invoice !== "string"
                ? session.invoice
                : null;
        const code = invoice?.custom_fields?.find(
            (field) => field.name === "Gift code",
        )?.value;
        if (!gift || !code) {
            return c.json({ error: "Gift receipt not found" }, 404);
        }

        return c.json({ code, pollenAmount: gift.pollenAmount });
    })
    .post(
        "/redeem",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            c.header("Cache-Control", "no-store");
            const user = c.var.auth.requireUser();
            const ipHash = await hashIp(
                getRealClientIp(c),
                c.env.BETTER_AUTH_SECRET,
            );
            const limits = await Promise.all([
                consumePollenGiftRateLimit(c.env.DB, {
                    key: `redeem-user:${user.id}`,
                    limit: REDEEM_RATE_LIMIT,
                    windowMs: REDEEM_RATE_WINDOW_MS,
                }),
                consumePollenGiftRateLimit(c.env.DB, {
                    key: `redeem-ip:${ipHash ?? "unknown"}`,
                    limit: REDEEM_RATE_LIMIT,
                    windowMs: REDEEM_RATE_WINDOW_MS,
                }),
            ]);
            const blockedLimit = limits.find((limit) => !limit.allowed);
            if (blockedLimit) {
                return c.json(
                    { error: "Too many attempts. Please try again later." },
                    429,
                    { "Retry-After": String(blockedLimit.retryAfterSeconds) },
                );
            }

            const body = (await c.req.json().catch(() => null)) as {
                code?: unknown;
            } | null;
            if (!body || typeof body.code !== "string") {
                return c.json({ error: INVALID_GIFT_MESSAGE }, 400);
            }

            const result = await redeemPollenGift(c.env.DB, {
                code: body.code,
                userId: user.id,
            });
            if (!result.redeemed) {
                return c.json({ error: INVALID_GIFT_MESSAGE }, 400);
            }

            return c.json(result);
        },
    );
