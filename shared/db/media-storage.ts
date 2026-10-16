// Media uploaded with a user's API key, paid in advance. Gen's cron
// (media-storage.ts) charges the key that uploaded a file for each period,
// rewrites the file if R2's 30-day lifecycle would delete it sooner, and
// deletes files whose paid time is over.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { apikey } from "./better-auth.ts";

// How a file's paid time runs out, named after OpenAI's `expires_after`
// anchors: "last_active_at" renews it when it is fetched in its last 15 days
// (the default), "created_at" never renews it, and "never" always does.
export const MEDIA_EXPIRY = ["last_active_at", "created_at", "never"] as const;
export type MediaExpiry = (typeof MEDIA_EXPIRY)[number];

export const mediaStorage = sqliteTable(
    "media_storage",
    {
        // The media id, also its R2 key.
        id: text("id").primaryKey(),
        // Pays every period. A deleted key pays nothing more, so its files
        // are deleted when their paid time is over.
        apiKeyId: text("api_key_id").references(() => apikey.id, {
            onDelete: "set null",
        }),
        size: integer("size").notNull(),
        expiresAfter: text("expires_after", { enum: MEDIA_EXPIRY }).notNull(),
        // Paid up to here; the file is deleted after it.
        paidUntil: integer("paid_until", { mode: "timestamp" }).notNull(),
        // A period waiting for the cron: it charges up to here and moves
        // paidUntil, or, if the key can't pay, drops it.
        renewTo: integer("renew_to", { mode: "timestamp" }),
    },
    (table) => [
        index("idx_media_storage_paid_until").on(table.paidUntil),
        index("idx_media_storage_renew_to").on(table.renewTo),
        // Deleting a key sets it null here.
        index("idx_media_storage_api_key_id").on(table.apiKeyId),
    ],
);
