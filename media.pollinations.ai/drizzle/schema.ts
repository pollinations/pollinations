import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const mediaObjects = sqliteTable(
  "media_objects",
  {
    hash: text("hash").primaryKey(),
    owner: text("owner").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    ownerIdx: index("idx_media_objects_owner").on(table.owner),
  }),
);

export const publicTags = sqliteTable(
  "public_tags",
  {
    hash: text("hash").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.hash, table.tag] }),
    tagIdx: index("idx_public_tags_tag").on(table.tag),
  }),
);

export const privateTags = sqliteTable(
  "private_tags",
  {
    hash: text("hash").notNull(),
    owner: text("owner").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.hash, table.owner, table.tag] }),
    ownerHashIdx: index("idx_private_tags_owner_hash").on(table.owner, table.hash),
  }),
);

export type MediaObject = typeof mediaObjects.$inferSelect;
export type PublicTag = typeof publicTags.$inferSelect;
export type PrivateTag = typeof privateTags.$inferSelect;
