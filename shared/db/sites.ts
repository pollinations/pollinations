// Static sites served at <name>.pollinations.app. The name is also the
// script's name in the sites dispatch namespace, so gen routes a host without
// reading this table; the row records who owns the name.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const site = sqliteTable(
    "site",
    {
        name: text("name").primaryKey(),
        // Null once the owner's account is deleted. Only blocked rows outlive
        // the account (see auth.ts), so their names stay reserved.
        userId: text("user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        // Null until the first upload is published.
        publishedAt: integer("published_at", { mode: "timestamp" }),
        // Taken down by an admin: the script is gone and the name stays reserved.
        blockedAt: integer("blocked_at", { mode: "timestamp" }),
    },
    (table) => [index("site_user_id_idx").on(table.userId)],
);
