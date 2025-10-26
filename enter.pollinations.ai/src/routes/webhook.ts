import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

export const webhookRoutes = new Hono<Env>().post("/polar", async (c) => {
    // Get webhook signature and timestamp
    const signature = c.req.header("polar-webhook-signature");
    const timestamp = c.req.header("polar-webhook-timestamp");
    
    if (!signature || !timestamp) {
        throw new HTTPException(401, { message: "Missing webhook headers" });
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text();
    
    // Verify signature
    // @ts-ignore - POLAR_WEBHOOK_SECRET needs to be added to CloudflareBindings type
    const webhookSecret = c.env.POLAR_WEBHOOK_SECRET || process.env.POLAR_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new HTTPException(500, { message: "POLAR_WEBHOOK_SECRET not configured" });
    }
    
    const expectedSignature = await verifyWebhookSignature(
        rawBody,
        signature,
        timestamp,
        webhookSecret,
    );

    if (!expectedSignature) {
        throw new HTTPException(401, { message: "Invalid webhook signature" });
    }

    // Check timestamp freshness (within 5 minutes)
    const timestampMs = parseInt(timestamp) * 1000;
    if (Date.now() - timestampMs > 300000) {
        throw new HTTPException(401, { message: "Webhook timestamp too old" });
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    
    // Only process subscription.created events
    if (payload.type !== "subscription.created") {
        return c.json({ received: true, processed: false });
    }

    // Check idempotency (prevent duplicate processing)
    const eventId = payload.data?.id;
    if (!eventId) {
        throw new HTTPException(400, { message: "Missing event ID" });
    }

    const processedKey = `webhook_processed:${eventId}`;
    const alreadyProcessed = await c.env.KV.get(processedKey);
    if (alreadyProcessed) {
        return c.json({ received: true, processed: false, reason: "already_processed" });
    }

    // Extract subscription data
    const subscription = payload.data;
    const externalCustomerId = subscription.customer?.external_id;
    const targetTier = subscription.metadata?.target_tier;
    
    if (!externalCustomerId || !targetTier) {
        throw new HTTPException(400, { message: "Missing required subscription data" });
    }

    // Validate tier value
    if (!["seed", "flower", "nectar"].includes(targetTier)) {
        throw new HTTPException(400, { message: "Invalid tier value" });
    }

    // Log subscription creation for monitoring
    // Note: Tiers are managed manually by admins, not automatically via subscriptions
    // Subscriptions grant pollen (via Polar meters), not tier access
    console.log("Subscription created:", {
        userId: externalCustomerId,
        targetTier: targetTier,
        subscriptionId: subscription.id,
    });

    // Mark as processed to prevent duplicate handling
    await c.env.KV.put(processedKey, "true", { expirationTtl: 86400 }); // 24 hours

    return c.json({
        received: true,
        processed: true,
        user_id: externalCustomerId,
        subscription_id: subscription.id,
        target_tier: targetTier,
    });
});

async function verifyWebhookSignature(
    rawBody: string,
    signature: string,
    timestamp: string,
    secret: string,
): Promise<boolean> {
    const payload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    
    return signature === expectedSignature;
}

export type WebhookRoutes = typeof webhookRoutes;
