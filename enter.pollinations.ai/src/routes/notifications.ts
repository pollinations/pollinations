import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { pushSubscription } from "@/db/schema/push-subscription.ts";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { validator } from "@/middleware/validator.ts";
import { generateRandomId } from "@/util.ts";

const SubscribeSchema = z.object({
    endpoint: z.url(),
    keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
    }),
});

export const notificationRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: false, allowSessionCookie: true }))
    .post(
        "/subscribe",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Subscribe to Push Notifications",
            responses: {
                200: { description: "Subscribed" },
                401: { description: "Unauthorized" },
            },
        }),
        validator("json", SubscribeSchema),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const sub = c.req.valid("json");
            const db = drizzle(c.env.DB);

            // Upsert: delete existing subscription with same endpoint, then insert
            await db
                .delete(pushSubscription)
                .where(eq(pushSubscription.endpoint, sub.endpoint));

            await db.insert(pushSubscription).values({
                id: generateRandomId(),
                userId: user.id,
                endpoint: sub.endpoint,
                subscriptionJson: JSON.stringify(sub),
            });

            return c.json({ ok: true });
        },
    )
    .post(
        "/unsubscribe",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Unsubscribe from Push Notifications",
            responses: {
                200: { description: "Unsubscribed" },
                401: { description: "Unauthorized" },
            },
        }),
        validator("json", z.object({ endpoint: z.url() })),
        async (c) => {
            await c.var.auth.requireAuthorization();
            c.var.auth.requireUser();
            const { endpoint } = c.req.valid("json");
            const db = drizzle(c.env.DB);

            await db
                .delete(pushSubscription)
                .where(eq(pushSubscription.endpoint, endpoint));

            return c.json({ ok: true });
        },
    )
    .get(
        "/status",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Get Push Notification Status",
            responses: {
                200: { description: "Notification status" },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB);

            const subs = await db
                .select({ id: pushSubscription.id })
                .from(pushSubscription)
                .where(eq(pushSubscription.userId, user.id))
                .all();

            return c.json({
                enabled: subs.length > 0,
                subscriptionCount: subs.length,
                vapidPublicKey: c.env.VAPID_PUBLIC_KEY || null,
            });
        },
    );
