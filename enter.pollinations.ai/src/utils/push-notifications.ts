import { getLogger } from "@logtape/logtape";
import { buildPushHTTPRequest } from "@pushforge/builder";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { pushSubscription } from "@/db/schema/push-subscription.ts";

type SpendNotificationParams = {
    db: D1Database;
    userId: string;
    totalPrice: number;
    model: string;
    vapidPrivateKey: string;
    referrerDomain?: string;
    apiKeyName?: string;
};

export async function sendSpendNotification({
    db,
    userId,
    totalPrice,
    model,
    vapidPrivateKey,
    referrerDomain,
    apiKeyName,
}: SpendNotificationParams): Promise<void> {
    const log = getLogger(["push", "spend"]);

    if (!vapidPrivateKey) {
        return; // VAPID not configured, skip silently
    }

    const d1 = drizzle(db);
    const subscriptions = await d1
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, userId))
        .all();

    if (subscriptions.length === 0) {
        log.info("No push subscriptions for user {userId}", { userId });
        return;
    }

    log.info("Found {count} push subscriptions for user {userId}", {
        count: subscriptions.length,
        userId,
    });

    let privateJWK: JsonWebKey;
    try {
        privateJWK = JSON.parse(vapidPrivateKey);
    } catch {
        log.error("Failed to parse VAPID_PRIVATE_KEY as JWK");
        return;
    }

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            const subscription = JSON.parse(sub.subscriptionJson);
            const { endpoint, headers, body } = await buildPushHTTPRequest({
                privateJWK,
                subscription,
                message: {
                    payload: {
                        title: `${totalPrice.toFixed(4)} pollen spent`,
                        body: [
                            `Model: ${model}`,
                            apiKeyName && `Key: ${apiKeyName}`,
                            referrerDomain && `From: ${referrerDomain}`,
                        ].filter(Boolean).join(" · "),
                        url: "/",
                    },
                    adminContact: "mailto:hello@pollinations.ai",
                    options: { ttl: 60 },
                },
            });

            log.info(
                "Sending push to {endpoint} with {headerCount} headers",
                {
                    endpoint: endpoint.toString(),
                    headerCount: Object.keys(headers).length,
                },
            );

            const resp = await fetch(endpoint, {
                method: "POST",
                headers,
                body,
            });

            log.info("Push response: status={status}", {
                status: resp.status,
            });

            // 410 Gone = subscription expired, clean up
            if (resp.status === 410 || resp.status === 404) {
                await d1
                    .delete(pushSubscription)
                    .where(eq(pushSubscription.id, sub.id));
                log.debug("Removed expired push subscription {id}", {
                    id: sub.id,
                });
            }

            if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
                log.warn(
                    "Push notification failed: status={status} endpoint={endpoint}",
                    { status: resp.status, endpoint: endpoint.toString() },
                );
            }
        }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
        log.warn("Push notifications: {failed}/{total} failed", {
            failed,
            total: subscriptions.length,
        });
    }
}
