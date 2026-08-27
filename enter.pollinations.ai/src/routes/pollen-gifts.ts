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
import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import {
    attachPollenGiftCheckoutSession,
    createPendingPollenGift,
    redeemPollenGift,
    voidPendingPollenGift,
} from "../services/pollen-gifts.ts";
import { createStripeClient } from "../utils/stripe.ts";

const CHECKOUT_THROTTLE_SECONDS = 3;
const CHECKOUT_THROTTLE_TTL_SECONDS = 60;
const INVALID_GIFT_MESSAGE = "This gift code is invalid or unavailable.";

export const pollenGiftRoutes = new Hono<Env>()
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
        const throttleKey = `pollen-gift-checkout:${ipHash ?? "unknown"}`;
        const lastCheckoutAt = Number(await c.env.KV.get(throttleKey));
        if (
            Number.isFinite(lastCheckoutAt) &&
            Date.now() - lastCheckoutAt < CHECKOUT_THROTTLE_SECONDS * 1000
        ) {
            return c.json(
                {
                    error: "Please wait a moment before starting another checkout.",
                },
                429,
                { "Retry-After": String(CHECKOUT_THROTTLE_SECONDS) },
            );
        }
        await c.env.KV.put(throttleKey, String(Date.now()), {
            expirationTtl: CHECKOUT_THROTTLE_TTL_SECONDS,
        });

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
        const baseUrl = getPublicOrigin(c);
        const successUrl = new URL("/pollen", baseUrl);
        successUrl.searchParams.set("mode", "gift");
        successUrl.searchParams.set("success", "true");
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
                // Existing economics queries read this field for non-pack purchases.
                packPollenGrant: String(amount),
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
                                    name: `🎁 ${amount} Pollen gift — ${gift.code}`,
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
                    success_url: successUrl.toString(),
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
    .post("/redeem", async (c) => {
        c.header("Cache-Control", "no-store");
        const auth = createAuth(c.env, c.executionCtx);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });
        if (!session?.user?.id) {
            return c.json({ error: "Authentication required" }, 401);
        }

        const body = (await c.req.json().catch(() => null)) as {
            code?: unknown;
        } | null;
        if (!body || typeof body.code !== "string") {
            return c.json({ error: INVALID_GIFT_MESSAGE }, 400);
        }

        const result = await redeemPollenGift(c.env.DB, {
            code: body.code,
            userId: session.user.id,
        });
        if (!result.redeemed) {
            return c.json({ error: INVALID_GIFT_MESSAGE }, 400);
        }

        return c.json(result);
    });
