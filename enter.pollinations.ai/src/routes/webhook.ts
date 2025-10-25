import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { user } from "../db/schema/better-auth.ts";
import { Polar } from "@polar-sh/sdk";

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
    const metadata = subscription.metadata;
    
    if (!externalCustomerId || !metadata?.target_tier || !metadata?.nonce) {
        throw new HTTPException(400, { message: "Missing required subscription data" });
    }

    // Load intent from KV
    const intentKey = `tier_intent:${externalCustomerId}`;
    const intentData = await c.env.KV.get(intentKey);
    
    if (!intentData) {
        // Intent expired or doesn't exist - cancel subscription
        await cancelSubscription(c.env, subscription.id);
        return c.json({
            received: true,
            processed: false,
            reason: "intent_not_found",
            action: "subscription_cancelled",
        });
    }

    const intent = JSON.parse(intentData);

    // Verify nonce matches
    if (intent.nonce !== metadata.nonce) {
        await cancelSubscription(c.env, subscription.id);
        return c.json({
            received: true,
            processed: false,
            reason: "nonce_mismatch",
            action: "subscription_cancelled",
        });
    }

    // Verify tier matches
    if (intent.target_tier !== metadata.target_tier) {
        await cancelSubscription(c.env, subscription.id);
        return c.json({
            received: true,
            processed: false,
            reason: "tier_mismatch",
            action: "subscription_cancelled",
        });
    }

    // Update user tier in database
    const db = drizzle(c.env.DB);
    try {
        await db
            .update(user)
            .set({ tier: intent.target_tier })
            .where(eq(user.id, externalCustomerId));

        // Mark as processed (TTL: 24 hours)
        await c.env.KV.put(processedKey, "true", { expirationTtl: 86400 });

        // Delete intent (single-use)
        await c.env.KV.delete(intentKey);

        return c.json({
            received: true,
            processed: true,
            user_id: externalCustomerId,
            tier: intent.target_tier,
        });
    } catch (error) {
        // Rollback: cancel subscription if DB update fails
        await cancelSubscription(c.env, subscription.id);
        throw new HTTPException(500, {
            message: "Failed to update user tier",
            cause: error,
        });
    }
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

async function cancelSubscription(env: Cloudflare.Env, subscriptionId: string): Promise<void> {
    try {
        const polar = new Polar({
            accessToken: env.POLAR_ACCESS_TOKEN,
            server: env.POLAR_SERVER,
        });
        // @ts-ignore - Polar SDK cancel method to be verified
        await polar.subscriptions.cancel({ id: subscriptionId });
    } catch (error) {
        console.error("Failed to cancel subscription:", error);
    }
}

export type WebhookRoutes = typeof webhookRoutes;
