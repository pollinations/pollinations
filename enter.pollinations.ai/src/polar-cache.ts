import { getLogger } from "@logtape/logtape";
import type { Polar } from "@polar-sh/sdk";

const log = getLogger(["hono", "polar-cache"]);

const KV_PREFIX = "polar:ids:";
const KV_OUTBOX_PREFIX = "polar:outbox:";
const CACHE_TTL_SECONDS = 86400; // 24 hours

export interface PolarIds {
    customerId: string;
    subscriptionId?: string;
    productId?: string;
    tier?: string;
    updatedAt: number;
}

export interface TierSyncEvent {
    userId: string;
    targetTier: string;
    userUpdatedAt: number;
    createdAt: number;
    attempts: number;
}

export async function getPolarIds(
    kv: KVNamespace,
    userId: string,
): Promise<PolarIds | null> {
    try {
        const key = `${KV_PREFIX}${userId}`;
        const cached = await kv.get(key, "json");
        return cached as PolarIds | null;
    } catch (error) {
        log.warn("Failed to get polar IDs from cache: {error}", { error });
        return null;
    }
}

export async function setPolarIds(
    kv: KVNamespace,
    userId: string,
    ids: PolarIds,
): Promise<void> {
    try {
        const key = `${KV_PREFIX}${userId}`;
        await kv.put(key, JSON.stringify(ids), {
            expirationTtl: CACHE_TTL_SECONDS,
        });
        log.debug("Cached polar IDs for user {userId}", { userId });
    } catch (error) {
        log.warn("Failed to cache polar IDs: {error}", { error });
    }
}

export async function deletePolarIds(
    kv: KVNamespace,
    userId: string,
): Promise<void> {
    try {
        const key = `${KV_PREFIX}${userId}`;
        await kv.delete(key);
    } catch (error) {
        log.warn("Failed to delete polar IDs from cache: {error}", { error });
    }
}

export async function lookupAndCachePolarIds(
    kv: KVNamespace,
    polar: Polar,
    userId: string,
): Promise<PolarIds | null> {
    try {
        const subscriptionsResponse = await polar.subscriptions.list({
            externalCustomerId: userId,
            active: true,
            limit: 1,
        });

        const subscription = subscriptionsResponse.result.items[0];
        if (!subscription) {
            log.debug("No active Polar subscription found for user {userId}", {
                userId,
            });
            return null;
        }

        const ids: PolarIds = {
            customerId: subscription.customerId,
            subscriptionId: subscription.id,
            productId: subscription.productId,
            tier: subscription.product?.metadata?.slug as string | undefined,
            updatedAt: Date.now(),
        };

        await setPolarIds(kv, userId, ids);
        return ids;
    } catch (error) {
        log.error("Failed to lookup Polar IDs for user {userId}: {error}", {
            userId,
            error,
        });
        return null;
    }
}

export async function getOrLookupPolarIds(
    kv: KVNamespace,
    polar: Polar,
    userId: string,
): Promise<PolarIds | null> {
    const cached = await getPolarIds(kv, userId);
    if (cached) {
        return cached;
    }
    return await lookupAndCachePolarIds(kv, polar, userId);
}

/**
 * Enqueue a tier sync event to the KV outbox.
 *
 * NOTE: There is a potential race condition between reading and writing to KV
 * (KV doesn't support atomic compare-and-set). This is acceptable for tier sync
 * because: (1) we're not handling financial transactions, (2) the worst case is
 * a redundant sync that sets the same tier, (3) the cron runs every minute so
 * any missed update will be caught on the next run.
 */
export async function enqueueTierSync(
    kv: KVNamespace,
    event: TierSyncEvent,
): Promise<void> {
    try {
        const key = `${KV_OUTBOX_PREFIX}${event.userId}`;
        const existing = (await kv.get(key, "json")) as TierSyncEvent | null;

        if (existing && existing.userUpdatedAt >= event.userUpdatedAt) {
            log.debug("Skipping stale tier sync event for user {userId}", {
                userId: event.userId,
            });
            return;
        }

        await kv.put(key, JSON.stringify(event), {
            expirationTtl: 3600,
        });
        log.debug("Enqueued tier sync for user {userId} to tier {tier}", {
            userId: event.userId,
            tier: event.targetTier,
        });
    } catch (error) {
        log.error("Failed to enqueue tier sync: {error}", { error });
    }
}

export async function dequeueTierSync(
    kv: KVNamespace,
    userId: string,
): Promise<TierSyncEvent | null> {
    try {
        const key = `${KV_OUTBOX_PREFIX}${userId}`;
        const event = (await kv.get(key, "json")) as TierSyncEvent | null;
        return event;
    } catch (error) {
        log.warn("Failed to dequeue tier sync: {error}", { error });
        return null;
    }
}

export async function completeTierSync(
    kv: KVNamespace,
    userId: string,
): Promise<void> {
    try {
        const key = `${KV_OUTBOX_PREFIX}${userId}`;
        await kv.delete(key);
    } catch (error) {
        log.warn("Failed to complete tier sync: {error}", { error });
    }
}

export async function listPendingTierSyncs(
    kv: KVNamespace,
    limit = 100,
): Promise<TierSyncEvent[]> {
    try {
        const list = await kv.list({ prefix: KV_OUTBOX_PREFIX, limit });
        const events: TierSyncEvent[] = [];

        for (const key of list.keys) {
            const event = (await kv.get(
                key.name,
                "json",
            )) as TierSyncEvent | null;
            if (event) {
                events.push(event);
            }
        }

        return events;
    } catch (error) {
        log.error("Failed to list pending tier syncs: {error}", { error });
        return [];
    }
}
