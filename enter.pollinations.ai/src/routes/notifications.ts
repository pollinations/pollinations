import { notification as notificationTable } from "@shared/db/notifications.ts";
import {
    MAX_NOTIFICATION_BODY_LENGTH,
    MAX_NOTIFICATION_TITLE_LENGTH,
    NOTIFICATION_TYPES,
    notifyUsers,
} from "@shared/notifications.ts";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const notificationSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    link: z.string().nullable(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
});

const listResponseSchema = z.object({
    notifications: z.array(notificationSchema),
    unreadCount: z.number(),
    // Pass back as `before` to page further into the inbox.
    nextCursor: z.string().nullable(),
});

const unreadCountResponseSchema = z.object({
    unreadCount: z.number(),
});

const markReadResponseSchema = z.object({
    id: z.string(),
    readAt: z.string(),
});

const markAllReadResponseSchema = z.object({
    updated: z.number(),
});

function toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

// The `read_at` column is an integer-seconds timestamp, so any Date we
// write gets floored to the second on storage. Floor here too before
// returning it, so the value in the response always matches what a
// subsequent read returns (see notifications.test.ts's idempotency check).
function nowFlooredToSecond(): Date {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
}

export const notificationsRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "List Notifications",
            description:
                "Returns the authenticated account's notifications, newest first, along with the current unread count. Supports cursor pagination via `before`, an `unread`-only filter, and a `type` filter (e.g. `price_change` for a models-page banner).",
            responses: {
                200: {
                    description: "Notification inbox page",
                    content: {
                        "application/json": {
                            schema: resolver(listResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view notifications",
            });
            const user = c.var.auth.requireUser();

            const limitParam = Number(c.req.query("limit"));
            const limit =
                Number.isFinite(limitParam) && limitParam > 0
                    ? Math.min(Math.trunc(limitParam), MAX_PAGE_SIZE)
                    : DEFAULT_PAGE_SIZE;
            const unreadOnly = c.req.query("unread") === "true";
            const type = c.req.query("type");
            const before = c.req.query("before");
            const beforeDate = before ? new Date(before) : null;
            if (before && (!beforeDate || Number.isNaN(beforeDate.getTime()))) {
                throw new HTTPException(400, {
                    message: "`before` must be a valid ISO timestamp",
                });
            }

            const db = drizzle(c.env.DB);

            const conditions = [eq(notificationTable.userId, user.id)];
            if (unreadOnly) conditions.push(isNull(notificationTable.readAt));
            if (type) conditions.push(eq(notificationTable.type, type));
            if (beforeDate) {
                conditions.push(lt(notificationTable.createdAt, beforeDate));
            }

            const [rows, unreadRows] = await Promise.all([
                db
                    .select()
                    .from(notificationTable)
                    .where(and(...conditions))
                    .orderBy(desc(notificationTable.createdAt))
                    .limit(limit + 1),
                db
                    .select({ id: notificationTable.id })
                    .from(notificationTable)
                    .where(
                        and(
                            eq(notificationTable.userId, user.id),
                            isNull(notificationTable.readAt),
                        ),
                    ),
            ]);

            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];

            return c.json({
                notifications: page.map((row) => ({
                    id: row.id,
                    type: row.type,
                    title: row.title,
                    body: row.body,
                    payload: row.payload ?? null,
                    link: row.link,
                    readAt: toIso(row.readAt),
                    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
                })),
                unreadCount: unreadRows.length,
                nextCursor: hasMore && last ? toIso(last.createdAt) : null,
            });
        },
    )
    .get(
        "/unread-count",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Get Unread Notification Count",
            description:
                "Returns the number of unread notifications for the authenticated account. Cheap to poll for a bell-icon badge.",
            responses: {
                200: {
                    description: "Unread count",
                    content: {
                        "application/json": {
                            schema: resolver(unreadCountResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view notifications",
            });
            const user = c.var.auth.requireUser();

            const db = drizzle(c.env.DB);
            const unreadRows = await db
                .select({ id: notificationTable.id })
                .from(notificationTable)
                .where(
                    and(
                        eq(notificationTable.userId, user.id),
                        isNull(notificationTable.readAt),
                    ),
                );

            return c.json({ unreadCount: unreadRows.length });
        },
    )
    .post(
        "/:id/read",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Mark Notification Read",
            description:
                "Marks a single notification owned by the authenticated account as read. Idempotent.",
            responses: {
                200: {
                    description: "Updated notification",
                    content: {
                        "application/json": {
                            schema: resolver(markReadResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                404: { description: "Notification not found" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to update notifications",
            });
            const user = c.var.auth.requireUser();
            const id = c.req.param("id");

            const db = drizzle(c.env.DB);
            const [existing] = await db
                .select({
                    id: notificationTable.id,
                    readAt: notificationTable.readAt,
                })
                .from(notificationTable)
                .where(
                    and(
                        eq(notificationTable.id, id),
                        eq(notificationTable.userId, user.id),
                    ),
                )
                .limit(1);

            if (!existing) {
                throw new HTTPException(404, {
                    message: "Notification not found",
                });
            }

            const readAt = existing.readAt ?? nowFlooredToSecond();
            if (!existing.readAt) {
                await db
                    .update(notificationTable)
                    .set({ readAt })
                    .where(eq(notificationTable.id, id));
            }

            return c.json({ id, readAt: readAt.toISOString() });
        },
    )
    .post(
        "/read-all",
        describeRoute({
            tags: ["🔔 Notifications"],
            summary: "Mark All Notifications Read",
            description:
                "Marks every unread notification owned by the authenticated account as read and returns how many were updated.",
            responses: {
                200: {
                    description: "Number of notifications updated",
                    content: {
                        "application/json": {
                            schema: resolver(markAllReadResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to update notifications",
            });
            const user = c.var.auth.requireUser();

            const db = drizzle(c.env.DB);
            const unread = await db
                .select({ id: notificationTable.id })
                .from(notificationTable)
                .where(
                    and(
                        eq(notificationTable.userId, user.id),
                        isNull(notificationTable.readAt),
                    ),
                );

            if (unread.length > 0) {
                await db
                    .update(notificationTable)
                    .set({ readAt: nowFlooredToSecond() })
                    .where(
                        and(
                            eq(notificationTable.userId, user.id),
                            isNull(notificationTable.readAt),
                        ),
                    );
            }

            return c.json({ updated: unread.length });
        },
    );

// --- Admin/internal creation ---
//
// Deliberately a separate Hono instance (not nested under the user-session
// `.use(auth(...))` above) and mounted under /api/admin, gated by the same
// bearer-token check as the rest of adminRoutes. Regular users never create
// their own notifications — only ops/admin tooling or server-side feature
// code (via `notifyUser`/`notifyUsers` in shared/notifications.ts) does, so
// this exists mainly for manual pushes (e.g. a one-off price-change notice)
// and for ops to test the pipeline end-to-end.

const createNotificationBodySchema = z.object({
    userIds: z.array(z.string()).min(1).max(10_000),
    type: z.enum(NOTIFICATION_TYPES),
    title: z.string().min(1).max(MAX_NOTIFICATION_TITLE_LENGTH),
    body: z.string().min(1).max(MAX_NOTIFICATION_BODY_LENGTH),
    payload: z.record(z.string(), z.unknown()).nullable().optional(),
    link: z.string().url().nullable().optional(),
});

const createNotificationResponseSchema = z.object({
    created: z.number(),
    ids: z.array(z.string()),
});

export const notificationsAdminRoutes = new Hono<Env>().post(
    "/",
    describeRoute({
        tags: ["🔔 Notifications"],
        summary: "Push Notification (Admin)",
        description:
            "Creates a notification for one or more users. Internal/ops use only — this is the same trigger surface (`notifyUsers`) that feature code calls directly, exposed here for manual pushes and testing.",
        responses: {
            200: {
                description: "Created notification ids",
                content: {
                    "application/json": {
                        schema: resolver(createNotificationResponseSchema),
                    },
                },
            },
            400: { description: "Invalid request body" },
            401: { description: "Unauthorized" },
        },
    }),
    async (c) => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        const parsed = createNotificationBodySchema.safeParse(body);
        if (!parsed.success) {
            throw new HTTPException(400, {
                message: parsed.error.issues[0]?.message ?? "Invalid request body",
            });
        }

        const { userIds, type, title, body: notificationBody, payload, link } =
            parsed.data;

        const db = drizzle(c.env.DB);
        const result = await notifyUsers(
            db,
            userIds.map((userId) => ({
                userId,
                type,
                title,
                body: notificationBody,
                payload: payload ?? null,
                link: link ?? null,
            })),
        );

        return c.json({ created: result.ids.length, ids: result.ids });
    },
);
