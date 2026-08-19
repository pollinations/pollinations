import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { notification as notificationTable } from "@shared/db/notifications.ts";
import { notifyUser, notifyUsers } from "@shared/notifications.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const baseUrl = "https://enter.pollinations.ai";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

async function getOnlyUserId(): Promise<string> {
    const db = drizzle(env.DB, { schema });
    const users = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .limit(1);
    const user = users[0];
    if (!user) throw new Error("Expected fixture user");
    return user.id;
}

// Inserts a second, unrelated user directly (no OAuth flow needed) so
// cross-user isolation tests have a real user id to satisfy the
// notification table's FK, without ever authenticating as them.
async function createOtherUserId(): Promise<string> {
    const db = drizzle(env.DB, { schema });
    const id = crypto.randomUUID();
    await db.insert(schema.user).values({
        id,
        name: "Other User",
        email: `${id}@example.com`,
        emailVerified: false,
    });
    return id;
}

describe("shared/notifications.ts trigger surface", () => {
    test("notifyUser inserts a row scoped to the user", async ({
        sessionToken,
    }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });

        const { id } = await notifyUser(db, {
            userId,
            type: "price_change",
            title: "Price change for flux",
            body: "flux's price changes tomorrow.",
            payload: { modelId: "flux", newPrice: 1.5 },
            link: "https://enter.pollinations.ai/models",
        });

        const [row] = await db
            .select()
            .from(notificationTable)
            .where(eq(notificationTable.id, id));

        expect(row).toMatchObject({
            id,
            userId,
            type: "price_change",
            title: "Price change for flux",
            body: "flux's price changes tomorrow.",
            payload: { modelId: "flux", newPrice: 1.5 },
            link: "https://enter.pollinations.ai/models",
        });
        expect(row?.readAt).toBeNull();

        // sessionToken fixture drives the OAuth setup that creates the user;
        // referencing it keeps that setup honest even though this test only
        // needs the resulting userId above.
        expect(sessionToken).toBeTruthy();
    });

    test("notifyUser rejects an unknown notification type", async ({
        sessionToken,
    }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });

        await expect(
            notifyUser(db, {
                userId,
                // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard
                type: "not_a_real_type" as any,
                title: "x",
                body: "y",
            }),
        ).rejects.toThrow(/unknown notification type/);
    });

    test("notifyUsers batches inserts for multiple users in one call", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB, { schema });
        const userId = await getOnlyUserId();

        const { ids } = await notifyUsers(db, [
            {
                userId,
                type: "system",
                title: "First",
                body: "First body",
            },
            {
                userId,
                type: "system",
                title: "Second",
                body: "Second body",
            },
        ]);

        expect(ids).toHaveLength(2);
        const rows = await db
            .select()
            .from(notificationTable)
            .where(eq(notificationTable.userId, userId));
        expect(rows.map((row) => row.title).sort()).toEqual([
            "First",
            "Second",
        ]);
    });
});

describe("GET /api/notifications", () => {
    test("requires authentication", async () => {
        const response = await SELF.fetch(`${baseUrl}/api/notifications`);
        expect(response.status).toBe(401);
    });

    test("lists the caller's notifications newest first with unread count", async ({
        sessionToken,
    }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });

        await notifyUser(db, {
            userId,
            type: "system",
            title: "Older",
            body: "older body",
            createdAt: new Date("2026-01-01T00:00:00Z"),
        });
        await notifyUser(db, {
            userId,
            type: "price_change",
            title: "Newer",
            body: "newer body",
            createdAt: new Date("2026-01-02T00:00:00Z"),
        });

        const response = await SELF.fetch(`${baseUrl}/api/notifications`, {
            headers: authHeaders(sessionToken),
        });
        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            notifications: { title: string }[];
            unreadCount: number;
        };

        expect(data.notifications.map((n) => n.title)).toEqual([
            "Newer",
            "Older",
        ]);
        expect(data.unreadCount).toBe(2);
    });

    test("does not return another user's notifications", async ({
        sessionToken,
        mocks,
    }) => {
        const db = drizzle(env.DB, { schema });
        const otherUserId = await createOtherUserId();

        // Notification for a user that never authenticates in this test.
        await notifyUser(db, {
            userId: otherUserId,
            type: "system",
            title: "Not yours",
            body: "should not appear",
        });

        const response = await SELF.fetch(`${baseUrl}/api/notifications`, {
            headers: authHeaders(sessionToken),
        });
        expect(response.status).toBe(200);
        const data = (await response.json()) as { notifications: unknown[] };
        expect(data.notifications).toEqual([]);
        expect(mocks).toBeTruthy();
    });
    test("filters by notification type", async ({ sessionToken }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });

        await notifyUser(db, {
            userId,
            type: "system",
            title: "System note",
            body: "body",
        });
        await notifyUser(db, {
            userId,
            type: "price_change",
            title: "Price change",
            body: "body",
        });

        const response = await SELF.fetch(
            `${baseUrl}/api/notifications?type=price_change`,
            { headers: authHeaders(sessionToken) },
        );
        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            notifications: { title: string; type: string }[];
        };
        expect(data.notifications).toHaveLength(1);
        expect(data.notifications[0]).toMatchObject({
            title: "Price change",
            type: "price_change",
        });
    });
});

describe("GET /api/notifications/unread-count", () => {
    test("counts only unread notifications", async ({ sessionToken }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });

        await notifyUser(db, {
            userId,
            type: "system",
            title: "Unread",
            body: "body",
        });
        const { id: readId } = await notifyUser(db, {
            userId,
            type: "system",
            title: "Already read",
            body: "body",
        });
        await db
            .update(notificationTable)
            .set({ readAt: new Date() })
            .where(eq(notificationTable.id, readId));

        const response = await SELF.fetch(
            `${baseUrl}/api/notifications/unread-count`,
            { headers: authHeaders(sessionToken) },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ unreadCount: 1 });
    });
});

describe("POST /api/notifications/:id/read", () => {
    test("marks a notification read and is idempotent", async ({
        sessionToken,
    }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });
        const { id } = await notifyUser(db, {
            userId,
            type: "system",
            title: "Mark me",
            body: "body",
        });

        const first = await SELF.fetch(
            `${baseUrl}/api/notifications/${id}/read`,
            { method: "POST", headers: authHeaders(sessionToken) },
        );
        expect(first.status).toBe(200);
        const firstBody = (await first.json()) as { readAt: string };
        expect(firstBody.readAt).toBeTruthy();

        const second = await SELF.fetch(
            `${baseUrl}/api/notifications/${id}/read`,
            { method: "POST", headers: authHeaders(sessionToken) },
        );
        expect(second.status).toBe(200);
        const secondBody = (await second.json()) as { readAt: string };
        // Same readAt on the second call: marking read is idempotent, not a
        // touch-on-every-call operation.
        expect(secondBody.readAt).toBe(firstBody.readAt);
    });

    test("404s for a notification owned by another user", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB, { schema });
        const otherUserId = await createOtherUserId();
        const { id } = await notifyUser(db, {
            userId: otherUserId,
            type: "system",
            title: "Not yours",
            body: "body",
        });

        const response = await SELF.fetch(
            `${baseUrl}/api/notifications/${id}/read`,
            { method: "POST", headers: authHeaders(sessionToken) },
        );
        expect(response.status).toBe(404);
    });
});

describe("POST /api/notifications/read-all", () => {
    test("marks every unread notification read and reports the count", async ({
        sessionToken,
    }) => {
        const userId = await getOnlyUserId();
        const db = drizzle(env.DB, { schema });
        await notifyUser(db, {
            userId,
            type: "system",
            title: "A",
            body: "body",
        });
        await notifyUser(db, {
            userId,
            type: "system",
            title: "B",
            body: "body",
        });

        const response = await SELF.fetch(
            `${baseUrl}/api/notifications/read-all`,
            { method: "POST", headers: authHeaders(sessionToken) },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ updated: 2 });

        const unreadResponse = await SELF.fetch(
            `${baseUrl}/api/notifications/unread-count`,
            { headers: authHeaders(sessionToken) },
        );
        expect(await unreadResponse.json()).toEqual({ unreadCount: 0 });
    });
});

describe("POST /api/admin/notifications", () => {
    test("rejects requests without an admin token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/notifications`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds: ["someone"],
                    type: "system",
                    title: "x",
                    body: "y",
                }),
            },
        );
        expect(response.status).toBe(401);
    });
});
