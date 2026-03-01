import Stripe from "stripe";

/**
 * Create a Stripe client instance
 */
export const createStripeClient = (env: CloudflareBindings): Stripe => {
    return new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    });
};
