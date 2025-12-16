import { Hono } from "hono";
import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { Polar } from "@polar-sh/sdk";
import type { Env } from "../env.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import {
    syncUserTier,
    getTierProductMap,
    isValidTier,
    type TierName,
} from "../tier-sync.ts";

const log = getLogger(["hono", "webhooks"]);

export const webhooksRoutes = new Hono<Env>().post("/polar", async (c) => {
    const webhookSecret = c.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
        log.warn("POLAR_WEBHOOK_SECRET not configured");
        return c.json({ error: "Webhook not configured" }, 500);
    }

    const signature = c.req.header("webhook-signature");
    if (!signature) {
        log.warn("Missing webhook signature");
        return c.json({ error: "Missing signature" }, 401);
    }

    const rawBody = await c.req.text();

    const isValid = await verifyWebhookSignature(
        rawBody,
        signature,
        webhookSecret,
    );
    if (!isValid) {
        log.warn("Invalid webhook signature");
        return c.json({ error: "Invalid signature" }, 401);
    }

    let payload: WebhookPayload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        log.warn("Invalid webhook payload");
        return c.json({ error: "Invalid payload" }, 400);
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

async function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    try {
        const parts = signature.split(",");
        const timestampPart = parts.find((p) => p.startsWith("t="));
        const signaturePart = parts.find((p) => p.startsWith("v1="));

        if (!timestampPart || !signaturePart) {
            return false;
        }

        const timestamp = timestampPart.substring(2);
        const expectedSignature = signaturePart.substring(3);

        // Validate timestamp is within 5 minutes to prevent replay attacks
        const timestampSeconds = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        const FIVE_MINUTES = 5 * 60;
        if (
            isNaN(timestampSeconds) ||
            Math.abs(now - timestampSeconds) > FIVE_MINUTES
        ) {
            log.warn("Webhook timestamp too old or invalid: {timestamp}", {
                timestamp,
            });
            return false;
        }

        const signedPayload = `${timestamp}.${payload}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const signatureBuffer = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(signedPayload),
        );
        const computedSignature = Array.from(new Uint8Array(signatureBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        // Constant-time comparison to prevent timing attacks
        if (computedSignature.length !== expectedSignature.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < computedSignature.length; i++) {
            result |=
                computedSignature.charCodeAt(i) ^
                expectedSignature.charCodeAt(i);
        }
        return result === 0;
    } catch (error) {
        log.error("Webhook signature verification failed: {error}", { error });
        return false;
    }
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

    const productMap = getTierProductMap(env);
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
