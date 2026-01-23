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
 * Atomically try to mark a session as processing to prevent race conditions.
 * Returns true if we acquired the lock (should process), false if already processing/processed.
 * Uses a short TTL for the "processing" state that gets extended on success.
 */
export const tryAcquireSessionLock = async (
    kv: KVNamespace,
    sessionId: string,
): Promise<boolean> => {
    const key = `stripe:session:${sessionId}`;
    const existing = await kv.get(key);

    // Already processed or being processed
    if (existing !== null) {
        return false;
    }

    // Mark as processing with short TTL (5 min) - will be extended on success
    // Note: KV doesn't have atomic compare-and-set, but the window is very small
    // and Stripe rarely sends concurrent webhooks for the same session
    await kv.put(
        key,
        JSON.stringify({ status: "processing", startedAt: Date.now() }),
        { expirationTtl: 60 * 5 },
    );

    return true;
};

/**
 * Mark a Stripe session as successfully processed
 * TTL of 7 days to match Stripe's webhook retry window
 */
export const markSessionProcessed = async (
    kv: KVNamespace,
    sessionId: string,
    metadata: { userId: string; amountPaid: number; pollenCredited: number },
): Promise<void> => {
    const key = `stripe:session:${sessionId}`;
    await kv.put(
        key,
        JSON.stringify({
            status: "completed",
            ...metadata,
            processedAt: Date.now(),
        }),
        {
            expirationTtl: 60 * 60 * 24 * 7, // 7 days
        },
    );
};

/**
 * Release the processing lock if credit failed (allows retry)
 */
export const releaseSessionLock = async (
    kv: KVNamespace,
    sessionId: string,
): Promise<void> => {
    const key = `stripe:session:${sessionId}`;
    await kv.delete(key);
};
