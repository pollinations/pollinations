// Media catalog: D1-backed metadata for published (tagged) media. Blobs stay
// in R2 — this module only indexes them. Tags are the publish action: only
// tagged uploads get catalog rows. Writes are awaited inline on the upload
// path (no waitUntil): a D1 failure surfaces as a 500 rather than silently
// dropping catalog data.

import { mediaItem, mediaTag } from "@shared/db/media-catalog.ts";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export type CatalogDb = ReturnType<typeof drizzle>;

export function getDb(d1: D1Database): CatalogDb {
    return drizzle(d1);
}

// Lowercase, trimmed slug: letters/digits, then `_.:+-` allowed after the
// first char. Keeps tags URL-safe and consistent for gallery lookups.
export const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:+-]{0,127}$/;
// Prose twin of TAG_PATTERN for error messages — keep in sync with the regex.
export const TAG_PATTERN_DESCRIPTION =
    "lowercase letters, digits, and _.:+- (not leading), max 128 chars";
export const MAX_TAGS = 8;

/** Thrown by normalizeTags; message is complete and user-facing. */
export class TagError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TagError";
    }
}

/**
 * Normalize and validate a set of raw tag strings. Throws on the first
 * invalid tag (naming it) or if the deduplicated count exceeds MAX_TAGS —
 * no silent drops.
 */
export function normalizeTags(rawTags: string[]): string[] {
    const seen = new Set<string>();
    for (const raw of rawTags) {
        const trimmed = raw.trim();
        if (trimmed === "") continue;
        const tag = trimmed.toLowerCase();
        if (!TAG_PATTERN.test(tag)) {
            // Name the tag as submitted (pre-lowercase) so the error is
            // unambiguous about which input was rejected.
            throw new TagError(
                `Invalid tag: "${trimmed}". Tags must match ${TAG_PATTERN_DESCRIPTION}.`,
            );
        }
        seen.add(tag);
    }
    const tags = [...seen];
    if (tags.length > MAX_TAGS) {
        throw new TagError(`Too many tags: ${tags.length} (max ${MAX_TAGS}).`);
    }
    return tags;
}

export interface InsertUploadParams {
    // The upload's id — also its R2 storage key. Minted by the caller so the
    // same value keys the blob and this row.
    id: string;
    ownerUserId: string;
    appKeyId: string | null;
    contentType: string;
    size: number;
    // Non-empty: tags are what publish an upload, so an untagged upload
    // never reaches the catalog at all.
    tags: string[];
}

/**
 * Insert a catalog row for a published upload together with its tags. Each
 * upload is its own row (re-uploading the same bytes is a new item, not an
 * upsert). Returns the item id.
 */
export async function insertUploadCatalogItem(
    db: CatalogDb,
    params: InsertUploadParams,
): Promise<string> {
    // One atomic batch: the item row and its tags land together or not at
    // all — a tagless catalog row would be invisible (galleries are
    // tag-scoped) yet undeletable by its owner via unpublish.
    await db.batch([
        db.insert(mediaItem).values({
            id: params.id,
            ownerUserId: params.ownerUserId,
            appKeyId: params.appKeyId,
            contentType: params.contentType,
            size: params.size,
            createdAt: new Date(),
        }),
        db.insert(mediaTag).values(
            params.tags.map((tag) => ({
                itemId: params.id,
                tag,
            })),
        ),
    ]);

    return params.id;
}

/**
 * The owner user id of a catalog item: null for an ownerless row, or
 * undefined when the id has no catalog row at all (unknown or uncataloged).
 */
export async function catalogItemOwner(
    db: CatalogDb,
    itemId: string,
): Promise<string | null | undefined> {
    const [row] = await db
        .select({ ownerUserId: mediaItem.ownerUserId })
        .from(mediaItem)
        .where(eq(mediaItem.id, itemId))
        .limit(1);
    return row ? row.ownerUserId : undefined;
}

/**
 * Delete a catalog item and its tags. Deleting the R2 blob is the caller's
 * responsibility.
 */
export async function deleteCatalogItem(
    db: CatalogDb,
    itemId: string,
): Promise<void> {
    // Explicit tag delete in the same atomic batch — doesn't depend on the
    // runtime enforcing ON DELETE CASCADE.
    await db.batch([
        db.delete(mediaTag).where(eq(mediaTag.itemId, itemId)),
        db.delete(mediaItem).where(eq(mediaItem.id, itemId)),
    ]);
}

export interface CatalogItem {
    id: string;
    contentType: string;
    size: number | null;
    createdAt: Date;
}

export interface CatalogPage {
    items: CatalogItem[];
    nextCursor: string | null;
    hasMore: boolean;
}

/** base64url(JSON [createdAtEpochSeconds, id]) keyset cursor. */
export function encodeCursor(createdAt: Date, id: string): string {
    const json = JSON.stringify([Math.floor(createdAt.getTime() / 1000), id]);
    return btoa(json)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export class InvalidCursorError extends Error {
    constructor() {
        super("Invalid cursor");
        this.name = "InvalidCursorError";
    }
}

export function decodeCursor(cursor: string): {
    createdAt: Date;
    id: string;
} {
    try {
        const padded = cursor
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(cursor.length / 4) * 4, "=");
        const [epochSeconds, id] = JSON.parse(atob(padded)) as [number, string];
        if (
            typeof epochSeconds !== "number" ||
            !Number.isFinite(epochSeconds) ||
            typeof id !== "string" ||
            id === ""
        ) {
            throw new Error("malformed cursor payload");
        }
        return { createdAt: new Date(epochSeconds * 1000), id };
    } catch {
        throw new InvalidCursorError();
    }
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * List the public gallery for a tag: any item carrying that tag, regardless
 * of owner, newest first by upload time. A tag is what publishes an item,
 * so this needs no auth. Ordering is (createdAt DESC, id DESC) with a keyset
 * cursor over the item table.
 */
export async function listMedia(
    db: CatalogDb,
    params: {
        tag: string;
        limit: number;
        cursor?: { createdAt: Date; id: string };
    },
): Promise<CatalogPage> {
    const conditions: SQL[] = [eq(mediaTag.tag, params.tag)];
    if (params.cursor) {
        conditions.push(beforeCursor(params.cursor));
    }

    const rows = await db
        .select({
            id: mediaItem.id,
            contentType: mediaItem.contentType,
            size: mediaItem.size,
            createdAt: mediaItem.createdAt,
        })
        .from(mediaItem)
        .innerJoin(mediaTag, eq(mediaTag.itemId, mediaItem.id))
        .where(and(...conditions))
        .orderBy(desc(mediaItem.createdAt), desc(mediaItem.id))
        .limit(params.limit + 1);

    return paginate(rows, params.limit);
}

// D1 caps bound parameters at 100 per statement. A full page holds up to
// MAX_LIMIT (100) ids, and some lookups bind values on top of the id list,
// so id-list queries run in chunks that stay well under the cap.
const ID_CHUNK_SIZE = 50;

function chunkIds(itemIds: string[]): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < itemIds.length; i += ID_CHUNK_SIZE) {
        chunks.push(itemIds.slice(i, i + ID_CHUNK_SIZE));
    }
    return chunks;
}

/** Fetch tags for a page of item ids, grouped by item id. */
export async function tagsForItems(
    db: CatalogDb,
    itemIds: string[],
): Promise<Map<string, string[]>> {
    const byItem = new Map<string, string[]>();
    for (const ids of chunkIds(itemIds)) {
        const rows = await db
            .select({ itemId: mediaTag.itemId, tag: mediaTag.tag })
            .from(mediaTag)
            .where(inArray(mediaTag.itemId, ids));

        for (const row of rows) {
            const existing = byItem.get(row.itemId);
            if (existing) {
                existing.push(row.tag);
            } else {
                byItem.set(row.itemId, [row.tag]);
            }
        }
    }
    return byItem;
}

function beforeCursor(cursor: { createdAt: Date; id: string }): SQL {
    // Keyset pagination on (createdAt, id) both descending: strictly older
    // rows, or same-instant rows with a strictly smaller id. Both branches
    // passed to `or`/`and` are always defined, so the result is never
    // undefined — assert that to keep the caller's condition arrays typed
    // as SQL (not SQL | undefined).
    return sql`${or(
        lt(mediaItem.createdAt, cursor.createdAt),
        and(
            eq(mediaItem.createdAt, cursor.createdAt),
            lt(mediaItem.id, cursor.id),
        ),
    )}`;
}

function paginate(rows: CatalogItem[], limit: number): CatalogPage {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
        hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
    return { items, nextCursor, hasMore };
}
