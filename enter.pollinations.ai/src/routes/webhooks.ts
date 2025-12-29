import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { Polar } from "@polar-sh/sdk";
import {
    validateEvent,
    WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import type { Env } from "../env.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import { syncUserTier } from "../tier-sync.ts";
import {
    isValidTier,
    getTierProductMapCached,
    type TierName,
} from "@/utils/polar.ts";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload.js";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload.js";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload.js";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload.js";

const log = getLogger(["hono", "webhooks"]);

export const webhooksRoutes = new Hono<Env>().post("/polar", async (c) => {
    const webhookSecret = c.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
        log.warn("POLAR_WEBHOOK_SECRET not configured");
        throw new HTTPException(500, { message: "Webhook not configured" });
    }

    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries());

    try {
        const payload = validateEvent(rawBody, headers, webhookSecret);
        log.info("Received Polar webhook: {type}", { type: payload.type });

        switch (payload.type) {
            case "subscription.canceled":
            case "subscription.revoked":
                await handleSubscriptionCanceled(c.env, payload);
                break;

            case "subscription.updated":
                await handleSubscriptionUpdated(c.env, payload);
                break;

            case "subscription.created":
                await handleSubscriptionCreated(c.env, payload);
                break;

            default:
                log.debug("Unhandled webhook type: {type}", {
                    type: payload.type,
                });
        }
    } catch (error) {
        if (error instanceof WebhookVerificationError) {
            log.warn("Invalid webhook signature: {error}", {
                error: error.message,
            });
            throw new HTTPException(401, { message: "Invalid signature" });
        }
        log.warn("Invalid webhook payload: {error}", { error });
        throw new HTTPException(400, { message: "Invalid payload" });
    }

    return c.json({ received: true });
});

async function handleSubscriptionCanceled(
    env: Cloudflare.Env,
    event:
        | WebhookSubscriptionCanceledPayload
        | WebhookSubscriptionRevokedPayload,
): Promise<void> {
    const externalId = event.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received subscription canceled webhook without external customer id",
        );
        return;
    }

    // Look up the user's tier from D1 (source of truth)
    const db = drizzle(env.DB);
    const users = await db
        .select({ tier: userTable.tier })
        .from(userTable)
        .where(eq(userTable.id, externalId))
        .limit(1);

    const userTier = users[0]?.tier;
    if (!userTier || !isValidTier(userTier)) {
        log.warn("User {userId} has invalid tier {tier}, defaulting to spore", {
            userId: externalId,
            tier: userTier,
        });
    }

    const targetTier: TierName = isValidTier(userTier) ? userTier : "spore";

    log.info(
        "Subscription canceled for user {userId}, reactivating to tier {tier}",
        {
            userId: externalId,
            tier: targetTier,
        },
    );

    // Initialize Polar and sync immediately
    if (!env.POLAR_ACCESS_TOKEN) {
        log.error(
            "Cannot reactivate subscription: POLAR_ACCESS_TOKEN not configured",
        );
        return;
    }

    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
    });

    const productMap = await getTierProductMapCached(polar, env.KV);
    const result = await syncUserTier(
        polar,
        externalId,
        targetTier,
        productMap,
    );

    if (result.success) {
        log.info(
            "Reactivated subscription for user {userId} in {attempts} attempt(s)",
            {
                userId: externalId,
                attempts: result.attempts,
            },
        );
    } else {
        log.error(
            "Failed to reactivate subscription for user {userId}: {error}",
            {
                userId: externalId,
                error: result.error,
            },
        );
    }
}

async function handleSubscriptionUpdated(
    env: Cloudflare.Env,
    payload: WebhookSubscriptionUpdatedPayload,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received subscription.updated webhook without external customer id",
        );
        return;
    }

    log.info("Subscription updated for user {userId}", {
        userId: externalId,
    });

    // Validate subscription tier against D1 (source of truth)
    await validateAndSyncSubscriptionTier(
        env,
        externalId,
        payload.data.productId,
    );
}

async function handleSubscriptionCreated(
    env: Cloudflare.Env,
    payload: WebhookSubscriptionCreatedPayload,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received subscription.created webhook without external customer id",
        );
        return;
    }

    log.info(
        "Subscription created for user {userId} with product {productId}",
        {
            userId: externalId,
            productId: payload.data.productId,
        },
    );

    // Validate subscription tier against D1 (source of truth)
    await validateAndSyncSubscriptionTier(
        env,
        externalId,
        payload.data.productId,
    );
}

/**
 * Validates that a subscription's tier matches the user's D1 tier.
 * If they don't match, syncs the Polar subscription to match D1.
 * This prevents unauthorized tier escalation (e.g., users getting Router tier).
 */
async function validateAndSyncSubscriptionTier(
    env: Cloudflare.Env,
    userId: string,
    subscriptionProductId: string,
): Promise<void> {
    if (!env.POLAR_ACCESS_TOKEN) {
        log.error(
            "Cannot validate subscription: POLAR_ACCESS_TOKEN not configured",
        );
        return;
    }

    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
    });

    // Get product map to determine tier from product ID
    const productMap = await getTierProductMapCached(polar, env.KV);

    // Find what tier this subscription's product corresponds to
    const subscriptionTierRaw = Object.entries(productMap)
        .filter(([_, product]) => product.id === subscriptionProductId)
        .map(([slug]) => slug.split(":").pop())
        .at(0);

    // Validate it's a known tier (type safety)
    if (!subscriptionTierRaw || !isValidTier(subscriptionTierRaw)) {
        // Product is not a tier product (might be a pack), ignore
        log.debug(
            "Subscription product {productId} is not a tier product, skipping validation",
            {
                productId: subscriptionProductId,
            },
        );
        return;
    }

    const subscriptionTier: TierName = subscriptionTierRaw;

    // Look up the user's tier from D1 (source of truth)
    const db = drizzle(env.DB);
    const users = await db
        .select({ tier: userTable.tier })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    const d1Tier = users[0]?.tier;
    const targetTier: TierName = isValidTier(d1Tier) ? d1Tier : "spore";

    // Check if subscription tier matches D1 tier
    if (subscriptionTier === targetTier) {
        log.debug("Subscription tier {tier} matches D1 for user {userId}", {
            tier: subscriptionTier,
            userId,
        });
        return;
    }

    // MISMATCH: Subscription tier doesn't match D1 - correct it
    log.warn(
        "Subscription tier mismatch for user {userId}: Polar has {polarTier}, D1 has {d1Tier}. Syncing to D1 tier.",
        {
            userId,
            polarTier: subscriptionTier,
            d1Tier: targetTier,
        },
    );

    const result = await syncUserTier(polar, userId, targetTier, productMap);

    if (result.success) {
        log.info("Corrected subscription for user {userId} to tier {tier}", {
            userId,
            tier: targetTier,
        });
    } else {
        log.error("Failed to correct subscription for user {userId}: {error}", {
            userId,
            error: result.error,
        });
    }
}
