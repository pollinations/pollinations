// Media catalog: queryable metadata for stored media (uploads now,
// generations later). Blobs stay in R2 — these tables only index them.
// One row per (owner, locator); public discovery is strictly opt-in via tags.

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
        id: text("id").primaryKey(),
        // What produced the bytes: direct upload today, gen catalog-by-reference later.
        kind: text("kind", { enum: ["upload", "generation"] }).notNull(),
        // upload: 16-hex content hash on media.pollinations.ai
        // generation: canonical gen.pollinations.ai URL (catalog params stripped)
        locator: text("locator").notNull(),
        // Server-attested from the verified API key — never from request params.
        ownerUserId: text("owner_user_id").references(() => user.id, {
            onDelete: "cascade",
        }),
        appKeyId: text("app_key_id"),
        contentType: text("content_type").notNull(),
        size: integer("size"),
        model: text("model"),
        prompt: text("prompt"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        uniqueIndex("idx_media_item_owner_locator").on(
            table.ownerUserId,
            table.locator,
        ),
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
        // Denormalized from media_item for newest-first tag listings.
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        uniqueIndex("idx_media_tag_item_tag").on(table.itemId, table.tag),
        index("idx_media_tag_tag_created").on(table.tag, table.createdAt),
    ],
);

export const mediaReaction = sqliteTable(
    "media_reaction",
    {
        itemId: text("item_id")
            .notNull()
            .references(() => mediaItem.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        // Open slug vocabulary ("like", "heart", "bookmark", ...) —
        // validated at the API layer.
        reaction: text("reaction").notNull(),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        // A user can give multiple different reactions to one item, but each
        // kind at most once. Leading column (itemId) also serves
        // count-by-item queries.
        uniqueIndex("idx_media_reaction_item_user_reaction").on(
            table.itemId,
            table.userId,
            table.reaction,
        ),
    ],
);
