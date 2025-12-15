import { Hono } from "hono";
import { getLogger } from "@logtape/logtape";
import { Polar } from "@polar-sh/sdk";
import type { Env } from "../env.ts";
import { enqueueTierSync, deletePolarIds } from "../polar-cache.ts";
import type { TierSyncEvent } from "../polar-cache.ts";

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
            await handleSubscriptionCanceled(c.env.KV, payload);
            break;

        case "subscription.updated":
            await handleSubscriptionUpdated(c.env.KV, payload);
            break;

        case "subscription.created":
            await handleSubscriptionCreated(c.env.KV, payload);
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

        return computedSignature === expectedSignature;
    } catch (error) {
        log.error("Webhook signature verification failed: {error}", { error });
        return false;
    }
}

async function handleSubscriptionCanceled(
    kv: KVNamespace,
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        log.warn("Subscription canceled but no external_id found");
        return;
    }

    log.info(
        "Subscription canceled for user {userId}, enqueueing reactivation",
        {
            userId: externalId,
        },
    );

    await deletePolarIds(kv, externalId);

    const event: TierSyncEvent = {
        userId: externalId,
        targetTier: "spore",
        userUpdatedAt: Date.now(),
        createdAt: Date.now(),
        attempts: 0,
    };
    await enqueueTierSync(kv, event);
}

async function handleSubscriptionUpdated(
    kv: KVNamespace,
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        return;
    }

    await deletePolarIds(kv, externalId);
    log.debug("Cleared cache for user {userId} after subscription update", {
        userId: externalId,
    });
}

async function handleSubscriptionCreated(
    kv: KVNamespace,
    payload: WebhookPayload,
): Promise<void> {
    const externalId = payload.data.customer?.external_id;
    if (!externalId) {
        return;
    }

    await deletePolarIds(kv, externalId);
    log.debug("Cleared cache for user {userId} after subscription created", {
        userId: externalId,
    });
}
