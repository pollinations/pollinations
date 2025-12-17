import { getLogger } from "@logtape/logtape";
import type { Polar } from "@polar-sh/sdk";
import { exponentialBackoffDelay } from "./util.ts";
import type { TierName, TierProductMap } from "./routes/polar.ts";

const log = getLogger(["hono", "tier-sync"]);

const MAX_ATTEMPTS = 3;

/**
 * Sync a user's Polar subscription to match their D1 tier.
 * Calls Polar API directly with retry logic (up to 3 attempts).
 */
export async function syncUserTier(
    polar: Polar,
    userId: string,
    targetTier: TierName,
    productMap: TierProductMap,
): Promise<{ success: boolean; error?: string; attempts: number }> {
    const targetProductId = productMap[targetTier];
    if (!targetProductId) {
        return {
            success: false,
            error: `No product ID for tier: ${targetTier}`,
            attempts: 0,
        };
    }

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            // Look up user's active subscription
            const subsResponse = await polar.subscriptions.list({
                externalCustomerId: userId,
                active: true,
                limit: 1,
            });

            const subscription = subsResponse.result.items[0];

            if (subscription) {
                // User has active subscription - check if already on target tier
                if (subscription.productId === targetProductId) {
                    log.debug("User {userId} already on target tier {tier}", {
                        userId,
                        tier: targetTier,
                    });
                    return { success: true, attempts: attempt };
                }

                // Update existing subscription
                log.info(
                    "Updating subscription for user {userId} to tier {tier}",
                    {
                        userId,
                        tier: targetTier,
                    },
                );

                await polar.subscriptions.update({
                    id: subscription.id,
                    subscriptionUpdate: {
                        productId: targetProductId,
                        prorationBehavior: "prorate",
                    },
                });

                return { success: true, attempts: attempt };
            }

            // No active subscription - create one
            // First, get the customer ID
            const customer = await polar.customers.getExternal({
                externalId: userId,
            });

            if (!customer) {
                return {
                    success: false,
                    error: "User has no Polar customer",
                    attempts: attempt,
                };
            }

            log.info("Creating subscription for user {userId} on tier {tier}", {
                userId,
                tier: targetTier,
            });

            await polar.subscriptions.create({
                productId: targetProductId,
                customerId: customer.id,
            });

            return { success: true, attempts: attempt };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            log.warn(
                "Tier sync attempt {attempt}/{max} failed for user {userId}: {error}",
                {
                    attempt,
                    max: MAX_ATTEMPTS,
                    userId,
                    error: lastError,
                },
            );

            if (attempt < MAX_ATTEMPTS) {
                const delay = exponentialBackoffDelay(attempt, {
                    minDelay: 100,
                    maxDelay: 5000,
                    maxAttempts: MAX_ATTEMPTS,
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    log.error(
        "Tier sync failed after {max} attempts for user {userId}: {error}",
        {
            max: MAX_ATTEMPTS,
            userId,
            error: lastError,
        },
    );

    return { success: false, error: lastError, attempts: MAX_ATTEMPTS };
}
