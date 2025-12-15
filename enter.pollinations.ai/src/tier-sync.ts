import { getLogger } from "@logtape/logtape";
import type { Polar } from "@polar-sh/sdk";
import {
    type PolarIds,
    type TierSyncEvent,
    setPolarIds,
    getOrLookupPolarIds,
    listPendingTierSyncs,
    completeTierSync,
    enqueueTierSync,
} from "./polar-cache.ts";

const log = getLogger(["hono", "tier-sync"]);

const MAX_ATTEMPTS = 3;
const RATE_LIMIT_DELAY_MS = 100;

export type TierName = "spore" | "seed" | "flower" | "nectar" | "router";

export interface TierProductMap {
    spore: string;
    seed: string;
    flower: string;
    nectar: string;
    router: string;
}

export function getTierProductMap(env: {
    POLAR_PRODUCT_TIER_SPORE?: string;
    POLAR_PRODUCT_TIER_SEED?: string;
    POLAR_PRODUCT_TIER_FLOWER?: string;
    POLAR_PRODUCT_TIER_NECTAR?: string;
    POLAR_PRODUCT_TIER_ROUTER?: string;
}): TierProductMap {
    return {
        spore: env.POLAR_PRODUCT_TIER_SPORE || "",
        seed: env.POLAR_PRODUCT_TIER_SEED || "",
        flower: env.POLAR_PRODUCT_TIER_FLOWER || "",
        nectar: env.POLAR_PRODUCT_TIER_NECTAR || "",
        router: env.POLAR_PRODUCT_TIER_ROUTER || "",
    };
}

export function isValidTier(tier: string): tier is TierName {
    return ["spore", "seed", "flower", "nectar", "router"].includes(tier);
}

export async function syncUserTier(
    kv: KVNamespace,
    polar: Polar,
    userId: string,
    targetTier: TierName,
    productMap: TierProductMap,
): Promise<{ success: boolean; error?: string }> {
    const targetProductId = productMap[targetTier];
    if (!targetProductId) {
        return {
            success: false,
            error: `No product ID for tier: ${targetTier}`,
        };
    }

    try {
        const polarIds = await getOrLookupPolarIds(kv, polar, userId);

        if (!polarIds) {
            return { success: false, error: "User has no Polar customer" };
        }

        if (polarIds.subscriptionId) {
            if (polarIds.productId === targetProductId) {
                log.debug("User {userId} already on target tier {tier}", {
                    userId,
                    tier: targetTier,
                });
                return { success: true };
            }

            log.info("Updating subscription for user {userId} to tier {tier}", {
                userId,
                tier: targetTier,
            });

            const updatedSub = await polar.subscriptions.update({
                id: polarIds.subscriptionId,
                subscriptionUpdate: {
                    productId: targetProductId,
                    prorationBehavior: "prorate",
                },
            });

            const updatedIds: PolarIds = {
                ...polarIds,
                subscriptionId: updatedSub.id,
                productId: updatedSub.productId,
                tier: targetTier,
                updatedAt: Date.now(),
            };
            await setPolarIds(kv, userId, updatedIds);

            return { success: true };
        }

        log.info("Creating subscription for user {userId} on tier {tier}", {
            userId,
            tier: targetTier,
        });

        const newSub = await polar.subscriptions.create({
            productId: targetProductId,
            customerId: polarIds.customerId,
        });

        const newIds: PolarIds = {
            ...polarIds,
            subscriptionId: newSub.id,
            productId: newSub.productId,
            tier: targetTier,
            updatedAt: Date.now(),
        };
        await setPolarIds(kv, userId, newIds);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Failed to sync tier for user {userId}: {error}", {
            userId,
            error: message,
        });
        return { success: false, error: message };
    }
}

export async function reactivateSubscription(
    kv: KVNamespace,
    polar: Polar,
    userId: string,
    defaultTier: TierName,
    productMap: TierProductMap,
): Promise<{ success: boolean; error?: string }> {
    log.info("Reactivating subscription for user {userId}", { userId });
    return await syncUserTier(kv, polar, userId, defaultTier, productMap);
}

export async function processPendingTierSyncs(
    kv: KVNamespace,
    polar: Polar,
    productMap: TierProductMap,
    batchSize = 10,
): Promise<{ processed: number; failed: number }> {
    const pending = await listPendingTierSyncs(kv, batchSize);
    let processed = 0;
    let failed = 0;

    for (const event of pending) {
        if (event.attempts >= MAX_ATTEMPTS) {
            log.warn(
                "Tier sync for user {userId} exceeded max attempts, skipping",
                {
                    userId: event.userId,
                },
            );
            await completeTierSync(kv, event.userId);
            failed++;
            continue;
        }

        if (!isValidTier(event.targetTier)) {
            log.warn("Invalid tier {tier} for user {userId}, skipping", {
                tier: event.targetTier,
                userId: event.userId,
            });
            await completeTierSync(kv, event.userId);
            failed++;
            continue;
        }

        const result = await syncUserTier(
            kv,
            polar,
            event.userId,
            event.targetTier,
            productMap,
        );

        if (result.success) {
            await completeTierSync(kv, event.userId);
            processed++;
        } else {
            // Update userUpdatedAt to now so this retry won't be overridden by stale checks
            const updatedEvent: TierSyncEvent = {
                ...event,
                attempts: event.attempts + 1,
                userUpdatedAt: Date.now(),
            };
            await enqueueTierSync(kv, updatedEvent);
            failed++;
        }

        await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMIT_DELAY_MS),
        );
    }

    if (processed > 0 || failed > 0) {
        log.info(
            "Tier sync batch complete: {processed} processed, {failed} failed",
            {
                processed,
                failed,
            },
        );
    }

    return { processed, failed };
}

export function createTierChangeHandler(kv: KVNamespace) {
    return async (userId: string, newTier: string, userUpdatedAt: Date) => {
        if (!isValidTier(newTier)) {
            log.warn("Invalid tier {tier} for user {userId}, not enqueueing", {
                tier: newTier,
                userId,
            });
            return;
        }

        const event: TierSyncEvent = {
            userId,
            targetTier: newTier,
            userUpdatedAt: userUpdatedAt.getTime(),
            createdAt: Date.now(),
            attempts: 0,
        };

        await enqueueTierSync(kv, event);
    };
}
