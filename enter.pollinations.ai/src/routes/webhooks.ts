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
    createTierProductMapCached,
    type TierName,
} from "./polar.ts";

const log = getLogger(["hono", "webhooks"]);

export const webhooksRoutes = new Hono<Env>().post("/polar", async (c) => {
    const webhookSecret = c.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
        log.warn("POLAR_WEBHOOK_SECRET not configured");
        throw new HTTPException(500, { message: "Webhook not configured" });
    }

    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries());

    let payload: WebhookPayload;
    try {
        const event = validateEvent(rawBody, headers, webhookSecret);
        payload = event as unknown as WebhookPayload;
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

    log.info("Received Polar webhook: {type}", { type: payload.type });

    switch (payload.type) {
        case "subscription.canceled":
        case "subscription.revoked":
            await handleSubscriptionCanceled(c.env, payload);
            break;

        case "subscription.updated":
            await handleSubscriptionUpdated(payload);
            break;

        case "subscription.created":
            await handleSubscriptionCreated(payload);
            break;

        default:
            log.debug("Unhandled webhook type: {type}", { type: payload.type });
    }

    return c.json({ received: true });
});

interface WebhookPayload {
    type: string;
    data: {
        id: string;
        customer_id: string;
        product_id: string;
        status: string;
        customer?: {
            id: string;
            external_id?: string;
            email?: string;
        };
        product?: {
            id: string;
            name?: string;
            metadata?: Record<string, unknown>;
        };
    };
}

async function handleSubscriptionCanceled(
    env: Cloudflare.Env,
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        log.warn("Subscription canceled but no external_id found");
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

    const getTierProductMap = createTierProductMapCached(env.KV);
    const productMap = await getTierProductMap(polar);
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
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        return;
    }

    log.debug("Subscription updated for user {userId}", {
        userId: externalId,
    });
}

async function handleSubscriptionCreated(
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        return;
    }

    log.debug("Subscription created for user {userId}", {
        userId: externalId,
    });
}
