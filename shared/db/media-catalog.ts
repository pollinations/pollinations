// Media catalog: queryable metadata for uploaded and generated media. Blobs
// stay in R2 — these tables only index them. Tags remain the *publish*
// action (only tagged items show up in a public gallery), but catalog rows
// now exist independently of tags so a user's private list can include
// untagged uploads and generations too. The row id is the R2 storage key
// and the public retrieval id.
//
// `ownerUserId` on media_item is the single-owner field used to authorize
// destructive actions (DELETE /media/:id, which removes the blob for
// everyone). It is only ever set for uploads, where the id is a random
// per-upload key with exactly one owner. Generations use a content-derived
// id that can be produced by many different users' requests (a cache hit
// replays someone else's file), so they have no single owner — deleting the
// underlying blob is not exposed for them. Instead, `media_user_link`
// records *association* (who has this in their personal list) separately
// from ownership: many users can link to the same item, and unlinking only
// removes that user's association, never the shared file. See media catalog
// issue tracker: "Add a private list of uploaded and generated media".
import {
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const mediaItem = sqliteTable(
    "media_item",
    {
        // Per-item id: also the R2 storage key and the public retrieval id.
        id: text("id").primaryKey(),
        // Server-attested from the verified API key — never from request
        // params. Null for generation items, which have no single owner.
        ownerUserId: text("owner_user_id").references(() => user.id, {
            onDelete: "cascade",
        }),
        appKeyId: text("app_key_id"),
        contentType: text("content_type").notNull(),
        size: integer("size"),
        // How this row entered the catalog: "upload" (via the media API,
        // single-owner) or "generation" (content-addressed, shared cache).
        // Drives which actions (delete vs. unlink) apply to the item.
        source: text("source", { enum: ["upload", "generation"] }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        index("idx_media_item_owner_created").on(
            table.ownerUserId,
            table.createdAt,
        ),
    ],
);

export const mediaUserLink = sqliteTable(
    "media_user_link",
    {
        itemId: text("item_id")
            .notNull()
            .references(() => mediaItem.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        // Recorded at link time from server-attested data (the upload's own
        // owner, or the generation request's authenticated user) — never
        // backfilled from later access. A historical item whose original
        // requester is unknown simply has no link row rather than being
        // attributed to whoever happens to trigger a later migration or
        // cache hit.
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        // One association per (user, item); linking twice is a no-op.
        primaryKey({ columns: [table.userId, table.itemId] }),
        // Covering index for the personal-list keyset query.
        index("idx_media_user_link_user_created").on(
            table.userId,
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
