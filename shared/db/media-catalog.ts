// Media catalog: queryable metadata for published (tagged) uploads. Blobs
// stay in R2 — these tables only index them. Tags are the publish action:
// only tagged uploads get a catalog row (untagged uploads stay uncataloged
// blobs behind their UUID). The row id is the R2 storage key and the public
// retrieval id. (Generations are not cataloged yet; see the
// generation-tagging followup.)

import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const mediaItem = sqliteTable(
    "media_item",
    {
        // Per-upload id: also the R2 storage key and the public retrieval id.
        id: text("id").primaryKey(),
        // Server-attested from the verified API key — never from request params.
        ownerUserId: text("owner_user_id").references(() => user.id, {
            onDelete: "cascade",
        }),
        appKeyId: text("app_key_id"),
        contentType: text("content_type").notNull(),
        size: integer("size"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        index("idx_media_item_owner_created").on(
            table.ownerUserId,
            table.createdAt,
        ),
    ],
);

export const mediaTag = sqliteTable(
    "media_tag",
    {
        itemId: text("item_id")
            .notNull()
            .references(() => mediaItem.id, { onDelete: "cascade" }),
        tag: text("tag").notNull(),
    },
    (table) => [
        uniqueIndex("idx_media_tag_item_tag").on(table.itemId, table.tag),
        // Covering index for gallery lookups: resolve a tag to its item ids
        // without touching the row; ordering comes from media_item.created_at
        // via the join.
        index("idx_media_tag_tag_item").on(table.tag, table.itemId),
    ],
);
