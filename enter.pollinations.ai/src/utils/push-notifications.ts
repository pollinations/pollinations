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

    if (!vapidPrivateKey) return;

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

    const title =
        totalPrice >= 0.1
            ? `${totalPrice.toFixed(3)} pollen spent`
            : `${Math.round(totalPrice * 1_000_000)} μp (micro-pollen) spent`;
    const bodyParts = [`Model: ${model}`];
    if (apiKeyName) bodyParts.push(`Key: ${apiKeyName}`);
    if (referrerDomain) bodyParts.push(`From: ${referrerDomain}`);
    const body = bodyParts.join(" · ");

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
