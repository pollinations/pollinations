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
