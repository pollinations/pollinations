import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const pushSubscription = sqliteTable(
    "push_subscription",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        endpoint: text("endpoint").notNull(),
        subscriptionJson: text("subscription_json").notNull(),
        createdAt: integer("created_at", { mode: "timestamp" })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index("idx_push_sub_user_id").on(table.userId),
        index("idx_push_sub_endpoint").on(table.endpoint),
    ],
);
