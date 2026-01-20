import Stripe from "stripe";

/**
 * Create a Stripe client instance
 */
export const createStripeClient = (env: CloudflareBindings): Stripe => {
    return new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    });
};

/**
 * Verify Stripe webhook signature
 */
export const verifyWebhookSignature = async (
    stripe: Stripe,
    payload: string,
    signature: string,
    webhookSecret: string,
): Promise<Stripe.Event> => {
    return stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
    );
};

/**
 * Check if a Stripe session has already been processed (idempotency)
 * Uses KV storage to track processed session IDs
 */
export const isSessionProcessed = async (
    kv: KVNamespace,
    sessionId: string,
): Promise<boolean> => {
    const key = `stripe:session:${sessionId}`;
    const existing = await kv.get(key);
    return existing !== null;
};

/**
 * Mark a Stripe session as processed
 * TTL of 7 days to match Stripe's webhook retry window
 */
export const markSessionProcessed = async (
    kv: KVNamespace,
    sessionId: string,
    metadata: { userId: string; units: number; packSlug: string },
): Promise<void> => {
    const key = `stripe:session:${sessionId}`;
    await kv.put(
        key,
        JSON.stringify({ ...metadata, processedAt: Date.now() }),
        {
            expirationTtl: 60 * 60 * 24 * 7, // 7 days
        },
    );
};
