// Media uploaded with `expiresAfter: "never"`. R2 deletes every media file 30
// days after it was last written, so gen's cron (media-keep.ts) rewrites each
// kept file before then, and the key that uploaded it pays for the time.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { apikey } from "./better-auth.ts";

export const mediaKeep = sqliteTable(
    "media_keep",
    {
        // The media id, also its R2 key.
        id: text("id").primaryKey(),
        // Pays every renewal; deleting the key ends the keep.
        apiKeyId: text("api_key_id")
            .notNull()
            .references(() => apikey.id, { onDelete: "cascade" }),
        size: integer("size").notNull(),
        // Storage is paid up to here. The first 30 days are free.
        paidUntil: integer("paid_until", { mode: "timestamp" }).notNull(),
    },
    (table) => [index("idx_media_keep_paid_until").on(table.paidUntil)],
);
