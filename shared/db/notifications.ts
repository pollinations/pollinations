// User-scoped notifications: the reusable inbox surface behind account,
// billing, and platform alerts (e.g. scheduled community-model price
// changes). Any feature pushes a notification for a user through
// `shared/notifications.ts`; this table is only ever read/written from
// there and from the dashboard-facing routes in
// `enter.pollinations.ai/src/routes/notifications.ts`.
//
// Deliberately user-scoped rather than a global broadcast table: a price
// change only needs to reach the users who actually called the affected
// model, and unread state is naturally per-user.

import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

// Kept as a plain string column (not a SQLite CHECK) so new notification
// types can ship without a migration; validated at the application layer
// instead (see NOTIFICATION_TYPES in shared/notifications.ts).
export const notification = sqliteTable(
    "notification",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        title: text("title").notNull(),
        body: text("body").notNull(),
        // Structured data for the client (e.g. { modelId, oldPrice, newPrice,
        // effectiveAt }). Free-form so features don't need a schema change to
        // attach context.
        payload: text("payload", { mode: "json" }).$type<
            Record<string, unknown>
        >(),
        // Optional call-to-action link rendered alongside the notification.
        link: text("link"),
        readAt: integer("read_at", { mode: "timestamp" }),
        createdAt: integer("created_at", { mode: "timestamp" })
            .default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`)
            .notNull(),
    },
    (table) => [
        // Inbox listing: newest first, scoped to the user.
        index("idx_notification_user_created").on(
            table.userId,
            table.createdAt,
        ),
        // Unread-count / unread-badge lookups.
        index("idx_notification_user_read").on(table.userId, table.readAt),
    ],
);

export const notificationRelations = relations(notification, ({ one }) => ({
    user: one(user, {
        fields: [notification.userId],
        references: [user.id],
    }),
}));
