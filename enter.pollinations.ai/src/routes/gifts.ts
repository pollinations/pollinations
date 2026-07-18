import { user as userTable } from "@shared/db/better-auth.ts";
import {
    calculateServiceFeeCents,
    formatPollenPackValue,
    getPollenPackByKey,
    SERVICE_FEE_NAME,
    SERVICE_FEE_TAX_CODE,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { getCohortFromCountry } from "../utils/currency-router.ts";
import { createStripeClient } from "../utils/stripe.ts";
import { getOrCreateStripeCustomerId } from "../utils/stripe-billing.ts";
import {
    getStripeNewCardGateStatus,
    stripeNewCardGateMetadata,
} from "../utils/stripe-card-gate.ts";
import { requireSessionUser } from "./stripe.ts";

// GitHub usernames are case-insensitive (github.com/OctoCat === /octocat),
// but the stored value preserves whatever case the account was created
// with. Compare case-insensitively so a differently-cased lookup still
// resolves.
async function findRecipientByGithubUsername(
    db: ReturnType<typeof drizzle>,
    githubUsername: string,
) {
    const [recipient] = await db
        .select({
            id: userTable.id,
            name: userTable.name,
            image: userTable.image,
            githubUsername: userTable.githubUsername,
        })
        .from(userTable)
        .where(
            sql`lower(${userTable.githubUsername}) = lower(${githubUsername})`,
        )
        .limit(1);

    return recipient;
}

export const giftsRoutes = new Hono<Env>()
    /**
     * GET /api/gifts/lookup/:githubUsername
     * Resolve a GitHub username to a Pollinations account for gift checkout.
     * Session-authenticated so the endpoint can't be used as a public
     * GitHub-username-to-Pollinations-account enumeration oracle.
     */
    .get("/lookup/:githubUsername", async (c) => {
        const sender = await requireSessionUser(c);
        const githubUsername = c.req.param("githubUsername").trim();

        if (!githubUsername) {
            return c.json({ error: "GitHub username is required" }, 400);
        }

        const db = drizzle(c.env.DB);
        const recipient = await findRecipientByGithubUsername(
            db,
            githubUsername,
        );

        if (!recipient) {
            return c.json(
                {
                    error: "No Pollinations account found for that GitHub username",
                },
                404,
            );
        }
        if (recipient.id === sender.id) {
            return c.json({ error: "You can't gift Pollen to yourself" }, 400);
        }

        return c.json({
            name: recipient.name,
            image: recipient.image,
            githubUsername: recipient.githubUsername,
        });
    })

    /**
     * GET /api/gifts/checkout/:packKey/:githubUsername
     * Create a Stripe Checkout Session that credits the recipient's
     * pack_balance instead of the payer's. Mirrors stripe.ts's
     * /checkout/:packKey handler; the recipient is re-resolved and
     * re-validated here (never trusted from client input) so a tampered
     * request can't redirect funds to an arbitrary account.
     */
    .get("/checkout/:packKey/:githubUsername", async (c) => {
        const pack = getPollenPackByKey(c.req.param("packKey"));
        if (!pack) {
            return c.json({ error: "Invalid pack" }, 400);
        }

        const sender = await requireSessionUser(c);
        const githubUsername = c.req.param("githubUsername").trim();

        const db = drizzle(c.env.DB);
        const recipient = await findRecipientByGithubUsername(
            db,
            githubUsername,
        );

        if (!recipient) {
            return c.json({ error: "Recipient not found" }, 404);
        }
        if (recipient.id === sender.id) {
            return c.json({ error: "You can't gift Pollen to yourself" }, 400);
        }

        const pmcId = c.env.STRIPE_PMC;
        if (!pmcId) {
            console.error(
                `Missing required env var STRIPE_PMC for gift checkout on ${c.env.ENVIRONMENT}`,
            );
            return c.json({ error: "Checkout configuration error" }, 500);
        }

        const stripe = createStripeClient(c.env);
        const baseUrl =
            c.env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production;
        const pollenUrl = new URL("/pollen", baseUrl);
        pollenUrl.searchParams.set("gift", "1");
        pollenUrl.searchParams.set("recipient", githubUsername);
        const pollenReturnUrl = pollenUrl.toString();

        const cohort = getCohortFromCountry(c.req.header("cf-ipcountry"));

        try {
            const stripeCustomerId = await getOrCreateStripeCustomerId(
                c.env,
                sender.id,
            );
            const newCardGate = await getStripeNewCardGateStatus(
                c.env.DB,
                sender.id,
            );

            // userId identifies the payer for the existing new-card
            // fingerprint gate (readUserIdFromMetadata / the failed-card
            // ledger); senderUserId/recipientUserId identify who pays and
            // who is credited for the gift-specific webhook branch.
            const giftMetadata = {
                type: "gift",
                userId: sender.id,
                senderUserId: sender.id,
                recipientUserId: recipient.id,
                recipientGithubUsername: githubUsername,
                packKey: pack.packKey,
                cohort,
                ...stripeNewCardGateMetadata(newCardGate),
            };
            const serviceFeeCents = calculateServiceFeeCents(
                pack.amountUsd * 100,
            );

            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "payment",
                payment_method_configuration: pmcId,
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            unit_amount: pack.amountUsd * 100,
                            tax_behavior: "exclusive",
                            product_data: {
                                name: `🎁 Gift: ${formatPollenPackValue(pack.amountUsd)} Pollen for @${githubUsername}`,
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
                adaptive_pricing: { enabled: true },
                allow_promotion_codes: true,
                automatic_tax: { enabled: true },
                billing_address_collection: "auto",
                tax_id_collection: { enabled: true },
                customer: stripeCustomerId,
                customer_update: {
                    address: "auto",
                    name: "auto",
                },
                payment_intent_data: {
                    metadata: giftMetadata,
                },
                invoice_creation: {
                    enabled: true,
                    invoice_data: {
                        rendering_options: {
                            amount_tax_display: "exclude_tax",
                        },
                    },
                },
                metadata: giftMetadata,
                success_url: `${pollenReturnUrl}&stripe_success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${pollenReturnUrl}&stripe_canceled=true`,
            });

            if (checkoutSession.url) {
                return c.redirect(checkoutSession.url);
            }

            return c.json({ error: "Failed to create checkout session" }, 500);
        } catch (error) {
            console.error("Stripe gift checkout error:", error);
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
    });
