// Media catalog: D1-backed metadata for stored media (tags, prompt, model,
// galleries). Blobs stay in R2 — this module only indexes them. Writes are
// awaited inline on the upload path (no waitUntil): a D1 failure surfaces as
// a 500 rather than silently dropping catalog data.

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

export interface UpsertUploadParams {
    ownerUserId: string;
    appKeyId: string | null;
    locator: string;
    contentType: string;
    size: number;
    model: string | null;
    prompt: string | null;
    tags: string[];
}

/**
 * Upsert a catalog row for an upload (keyed on ownerUserId+locator), then
 * merge in any tags. Returns the catalog item id.
 */
export async function upsertUploadCatalogItem(
    db: CatalogDb,
    params: UpsertUploadParams,
): Promise<string> {
    const now = new Date();
    const [row] = await db
        .insert(mediaItem)
        .values({
            id: crypto.randomUUID(),
            kind: "upload",
            locator: params.locator,
            ownerUserId: params.ownerUserId,
            appKeyId: params.appKeyId,
            contentType: params.contentType,
            size: params.size,
            model: params.model,
            prompt: params.prompt,
            createdAt: now,
        })
        .onConflictDoUpdate({
            target: [mediaItem.ownerUserId, mediaItem.locator],
            // createdAt is deliberately NOT updated: it marks first catalog
            // time, so re-uploading (which refreshes the R2 TTL and metadata)
            // can't bump an item back to the top of newest-first feeds.
            set: {
                contentType: params.contentType,
                size: params.size,
                model: params.model,
                prompt: params.prompt,
            },
        })
        .returning({ id: mediaItem.id });

    if (params.tags.length > 0) {
        await db
            .insert(mediaTag)
            .values(
                params.tags.map((tag) => ({
                    itemId: row.id,
                    tag,
                    createdAt: now,
                })),
            )
            .onConflictDoNothing({
                target: [mediaTag.itemId, mediaTag.tag],
            });
    }

    return row.id;
}

export interface CatalogItem {
    id: string;
    kind: "upload" | "generation";
    locator: string;
    contentType: string;
    size: number | null;
    model: string | null;
    prompt: string | null;
    createdAt: Date;
}

export interface CatalogPage {
    items: CatalogItem[];
    nextCursor: string | null;
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

/** Clamp a user-supplied limit into [1, MAX_LIMIT], NaN-safe. */
export function clampLimit(raw: string | null | undefined): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}

/** List catalog items owned by a user, newest first, optionally by tag. */
export async function listUserMedia(
    db: CatalogDb,
    params: {
        ownerUserId: string;
        tag?: string;
        limit: number;
        cursor?: { createdAt: Date; id: string };
    },
): Promise<CatalogPage> {
    const conditions = [eq(mediaItem.ownerUserId, params.ownerUserId)];
    if (params.cursor) {
        conditions.push(beforeCursor(params.cursor));
    }

    if (params.tag) {
        const rows = await db
            .select({
                id: mediaItem.id,
                kind: mediaItem.kind,
                locator: mediaItem.locator,
                contentType: mediaItem.contentType,
                size: mediaItem.size,
                model: mediaItem.model,
                prompt: mediaItem.prompt,
                createdAt: mediaItem.createdAt,
            })
            .from(mediaItem)
            .innerJoin(mediaTag, eq(mediaTag.itemId, mediaItem.id))
            .where(and(eq(mediaTag.tag, params.tag), ...conditions))
            .orderBy(desc(mediaItem.createdAt), desc(mediaItem.id))
            .limit(params.limit + 1);
        return paginate(rows, params.limit);
    }

    const rows = await db
        .select({
            id: mediaItem.id,
            kind: mediaItem.kind,
            locator: mediaItem.locator,
            contentType: mediaItem.contentType,
            size: mediaItem.size,
            model: mediaItem.model,
            prompt: mediaItem.prompt,
            createdAt: mediaItem.createdAt,
        })
        .from(mediaItem)
        .where(and(...conditions))
        .orderBy(desc(mediaItem.createdAt), desc(mediaItem.id))
        .limit(params.limit + 1);
    return paginate(rows, params.limit);
}

/**
 * Public gallery: list catalog items for a tag, newest first by when each
 * item was tagged (media_tag.created_at is insert-only), not by the item's
 * own createdAt. Late-tagged items surface as freshly published, and
 * re-uploads can't bump themselves back to the top. The cursor rides on
 * (taggedAt, itemId).
 */
export async function listByTag(
    db: CatalogDb,
    params: {
        tag: string;
        limit: number;
        cursor?: { createdAt: Date; id: string };
    },
): Promise<CatalogPage> {
    const conditions = [eq(mediaTag.tag, params.tag)];
    if (params.cursor) {
        conditions.push(
            sql`${or(
                lt(mediaTag.createdAt, params.cursor.createdAt),
                and(
                    eq(mediaTag.createdAt, params.cursor.createdAt),
                    lt(mediaItem.id, params.cursor.id),
                ),
            )}`,
        );
    }

    const rows = await db
        .select({
            id: mediaItem.id,
            kind: mediaItem.kind,
            locator: mediaItem.locator,
            contentType: mediaItem.contentType,
            size: mediaItem.size,
            model: mediaItem.model,
            prompt: mediaItem.prompt,
            createdAt: mediaItem.createdAt,
            taggedAt: mediaTag.createdAt,
        })
        .from(mediaTag)
        .innerJoin(mediaItem, eq(mediaItem.id, mediaTag.itemId))
        .where(and(...conditions))
        .orderBy(desc(mediaTag.createdAt), desc(mediaItem.id))
        .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page[page.length - 1];
    return {
        items: page.map(({ taggedAt: _taggedAt, ...item }) => item),
        nextCursor:
            hasMore && last ? encodeCursor(last.taggedAt, last.id) : null,
    };
}

/** Fetch tags for a page of item ids in one query, grouped by item id. */
export async function tagsForItems(
    db: CatalogDb,
    itemIds: string[],
): Promise<Map<string, string[]>> {
    const byItem = new Map<string, string[]>();
    if (itemIds.length === 0) return byItem;

    const rows = await db
        .select({ itemId: mediaTag.itemId, tag: mediaTag.tag })
        .from(mediaTag)
        .where(inArray(mediaTag.itemId, itemIds));

    for (const row of rows) {
        const existing = byItem.get(row.itemId);
        if (existing) {
            existing.push(row.tag);
        } else {
            byItem.set(row.itemId, [row.tag]);
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
    return { items, nextCursor };
}
