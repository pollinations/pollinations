import { getLogger } from "@logtape/logtape";
import { buildPushHTTPRequest } from "@pushforge/builder";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { pushSubscription } from "@/db/schema/push-subscription.ts";

const WINDOW_MS = 60_000; // 60 second aggregation window
const KV_TTL_S = 300; // 5 minutes — long enough to avoid eviction mid-window

type SpendNotificationParams = {
    db: D1Database;
    kv: KVNamespace;
    userId: string;
    totalPrice: number;
    model: string;
    vapidPrivateKey: string;
    referrerDomain?: string;
    apiKeyName?: string;
};

type AggregationState = {
    // Timestamp (ms) of the last notification actually sent
    lastSentAt: number;
    // Accumulated spend since lastSentAt
    pendingPrice: number;
    pendingCount: number;
    pendingModels: string[];
    pendingKeys: string[];
};

export async function sendSpendNotification({
    db,
    kv,
    userId,
    totalPrice,
    model,
    vapidPrivateKey,
    referrerDomain,
    apiKeyName,
}: SpendNotificationParams): Promise<void> {
    const log = getLogger(["push", "spend"]);

    if (!vapidPrivateKey) return;

    const now = Date.now();
    const kvKey = `push-agg:${userId}`;
    const stateRaw = await kv.get(kvKey);
    const state: AggregationState = stateRaw
        ? JSON.parse(stateRaw)
        : {
              lastSentAt: 0,
              pendingPrice: 0,
              pendingCount: 0,
              pendingModels: [],
              pendingKeys: [],
          };

    // Accumulate this spend into pending
    state.pendingPrice += totalPrice;
    state.pendingCount += 1;
    if (!state.pendingModels.includes(model)) {
        state.pendingModels.push(model);
    }
    if (apiKeyName && !state.pendingKeys.includes(apiKeyName)) {
        state.pendingKeys.push(apiKeyName);
    }

    const timeSinceLastSent = now - state.lastSentAt;
    const shouldSend = timeSinceLastSent >= WINDOW_MS;

    if (!shouldSend) {
        // Just update the pending state, don't send
        await kv.put(kvKey, JSON.stringify(state), {
            expirationTtl: KV_TTL_S,
        });
        log.info(
            "Aggregating push for user {userId}: {count} pending, {price} pollen",
            {
                userId,
                count: state.pendingCount,
                price: state.pendingPrice,
            },
        );
        return;
    }

    // Time to send — snapshot pending state for notification content
    const notifPrice = state.pendingPrice;
    const notifCount = state.pendingCount;
    const notifModels = state.pendingModels;
    const notifKeys = state.pendingKeys;

    // Reset pending, mark sent
    const newState: AggregationState = {
        lastSentAt: now,
        pendingPrice: 0,
        pendingCount: 0,
        pendingModels: [],
        pendingKeys: [],
    };
    await kv.put(kvKey, JSON.stringify(newState), {
        expirationTtl: KV_TTL_S,
    });

    // Build notification content
    const title = `${notifPrice.toFixed(4)} pollen spent`;
    const bodyParts: string[] = [];
    if (notifCount > 1) {
        bodyParts.push(`${notifCount} requests`);
    }
    bodyParts.push(`Model: ${notifModels.join(", ")}`);
    if (notifKeys.length > 0) {
        bodyParts.push(`Key: ${notifKeys.join(", ")}`);
    }
    if (referrerDomain) {
        bodyParts.push(`From: ${referrerDomain}`);
    }
    const body = bodyParts.join(" · ");

    await sendPushToSubscriptions({
        db,
        userId,
        vapidPrivateKey,
        title,
        body,
        log,
    });
}

async function sendPushToSubscriptions({
    db,
    userId,
    vapidPrivateKey,
    title,
    body,
    log,
}: {
    db: D1Database;
    userId: string;
    vapidPrivateKey: string;
    title: string;
    body: string;
    log: ReturnType<typeof getLogger>;
}): Promise<void> {
    const d1 = drizzle(db);
    const subscriptions = await d1
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, userId))
        .all();

    if (subscriptions.length === 0) return;

    let privateJWK: JsonWebKey;
    try {
        privateJWK = JSON.parse(vapidPrivateKey);
    } catch {
        log.error("Failed to parse VAPID_PRIVATE_KEY as JWK");
        return;
    }

    await Promise.allSettled(
        subscriptions.map(async (sub) => {
            const subscription = JSON.parse(sub.subscriptionJson);
            const { endpoint, headers, body: pushBody } =
                await buildPushHTTPRequest({
                    privateJWK,
                    subscription,
                    message: {
                        payload: { title, body, url: "/" },
                        adminContact: "mailto:hello@pollinations.ai",
                        options: { ttl: 60 },
                    },
                });

            const resp = await fetch(endpoint, {
                method: "POST",
                headers,
                body: pushBody,
            });

            if (resp.status === 410 || resp.status === 404) {
                await d1
                    .delete(pushSubscription)
                    .where(eq(pushSubscription.id, sub.id));
            } else if (!resp.ok) {
                log.warn("Push failed: status={status}", {
                    status: resp.status,
                });
            }
        }),
    );
}
