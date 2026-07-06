// Media catalog: D1-backed metadata for stored media (tags, prompt, model,
// galleries). Blobs stay in R2 — this module only indexes them. Writes are
// awaited inline on the upload path (no waitUntil): a D1 failure surfaces as
// a 500 rather than silently dropping catalog data.

import {
    mediaItem,
    mediaReaction,
    mediaTag,
} from "@shared/db/media-catalog.ts";
import type { SQL } from "drizzle-orm";
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export type CatalogDb = ReturnType<typeof drizzle>;

export function getDb(d1: D1Database): CatalogDb {
    return drizzle(d1);
}

// Lowercase, trimmed slug: letters/digits, then `_.:+-` allowed after the
// first char. Keeps tags URL-safe and consistent for gallery lookups.
export const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:+-]{0,127}$/;
export const MAX_TAGS = 8;

export class InvalidTagError extends Error {
    constructor(public readonly tag: string) {
        super(`Invalid tag: "${tag}"`);
        this.name = "InvalidTagError";
    }
}

export class TooManyTagsError extends Error {
    constructor(public readonly count: number) {
        super(`Too many tags: ${count} (max ${MAX_TAGS})`);
        this.name = "TooManyTagsError";
    }
}

// Reaction kinds are an open slug vocabulary ("like", "heart", "bookmark",
// ...): lowercase letters/digits, then `_-` allowed after the first char,
// max 32 chars.
export const REACTION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export class InvalidReactionError extends Error {
    constructor(public readonly reaction: string) {
        super(`Invalid reaction: "${reaction}"`);
        this.name = "InvalidReactionError";
    }
}

/**
 * Normalize (trim + lowercase) and validate a reaction kind. Throws
 * InvalidReactionError naming the submitted value on mismatch.
 */
export function normalizeReaction(raw: string): string {
    const reaction = raw.trim().toLowerCase();
    if (!REACTION_PATTERN.test(reaction)) {
        // Name the value as submitted (pre-lowercase) so the error is
        // unambiguous about which input was rejected.
        throw new InvalidReactionError(raw.trim());
    }
    return reaction;
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
            throw new InvalidTagError(trimmed);
        }
        seen.add(tag);
    }
    const tags = [...seen];
    if (tags.length > MAX_TAGS) {
        throw new TooManyTagsError(tags.length);
    }
    return tags;
}

export interface UpsertUploadParams {
    ownerUserId: string;
    appKeyId: string | null;
    locator: string;
    contentHash: string;
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
            contentHash: params.contentHash,
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
            set: {
                createdAt: now,
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

/** Public gallery: list catalog items for a tag, newest first. */
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
        conditions.push(beforeCursor(params.cursor));
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
        .from(mediaTag)
        .innerJoin(mediaItem, eq(mediaItem.id, mediaTag.itemId))
        .where(and(...conditions))
        .orderBy(desc(mediaItem.createdAt), desc(mediaItem.id))
        .limit(params.limit + 1);
    return paginate(rows, params.limit);
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

// A user may hold at most this many distinct reaction kinds on one item —
// the vocabulary is open, so without a cap one user could grow D1 unbounded
// by inventing kinds. Mirrors MAX_TAGS.
export const MAX_REACTION_KINDS_PER_ITEM = 8;

/**
 * Whether a user may react to an item: it must be their own, or publicly
 * discoverable (carries at least one tag). Untagged items owned by someone
 * else are private — callers should answer 404 (not 403) so a leaked item
 * id isn't confirmed to exist.
 */
export async function isItemReactable(
    db: CatalogDb,
    itemId: string,
    userId: string,
): Promise<boolean> {
    const [row] = await db
        .select({ ownerUserId: mediaItem.ownerUserId })
        .from(mediaItem)
        .where(eq(mediaItem.id, itemId))
        .limit(1);
    if (!row) return false;
    if (row.ownerUserId === userId) return true;
    const [tagged] = await db
        .select({ itemId: mediaTag.itemId })
        .from(mediaTag)
        .where(eq(mediaTag.itemId, itemId))
        .limit(1);
    return tagged !== undefined;
}

/**
 * React to an item on behalf of a user. Idempotent: repeating the same
 * reaction kind is a no-op.
 */
export async function addReaction(
    db: CatalogDb,
    itemId: string,
    userId: string,
    reaction: string,
): Promise<void> {
    await db
        .insert(mediaReaction)
        .values({ itemId, userId, reaction, createdAt: new Date() })
        .onConflictDoNothing({
            target: [
                mediaReaction.itemId,
                mediaReaction.userId,
                mediaReaction.reaction,
            ],
        });
}

/**
 * Remove a user's reaction of one kind from an item. Idempotent: removing
 * a reaction that isn't there is a no-op.
 */
export async function removeReaction(
    db: CatalogDb,
    itemId: string,
    userId: string,
    reaction: string,
): Promise<void> {
    await db
        .delete(mediaReaction)
        .where(
            and(
                eq(mediaReaction.itemId, itemId),
                eq(mediaReaction.userId, userId),
                eq(mediaReaction.reaction, reaction),
            ),
        );
}

/** Count reactions of one kind for a single item. */
export async function reactionCountForItem(
    db: CatalogDb,
    itemId: string,
    reaction: string,
): Promise<number> {
    const [row] = await db
        .select({ count: count() })
        .from(mediaReaction)
        .where(
            and(
                eq(mediaReaction.itemId, itemId),
                eq(mediaReaction.reaction, reaction),
            ),
        );
    return row?.count ?? 0;
}

/**
 * Count reactions for a page of item ids in one grouped query, keyed by
 * item id, then by reaction kind.
 */
export async function reactionCountsForItems(
    db: CatalogDb,
    itemIds: string[],
): Promise<Map<string, Record<string, number>>> {
    const byItem = new Map<string, Record<string, number>>();
    if (itemIds.length === 0) return byItem;

    const rows = await db
        .select({
            itemId: mediaReaction.itemId,
            reaction: mediaReaction.reaction,
            count: count(),
        })
        .from(mediaReaction)
        .where(inArray(mediaReaction.itemId, itemIds))
        .groupBy(mediaReaction.itemId, mediaReaction.reaction);

    for (const row of rows) {
        const existing = byItem.get(row.itemId);
        if (existing) {
            existing[row.reaction] = row.count;
        } else {
            byItem.set(row.itemId, { [row.reaction]: row.count });
        }
    }
    return byItem;
}

/** A user's reaction kinds for a page of item ids, in one query. */
export async function userReactionsForItems(
    db: CatalogDb,
    itemIds: string[],
    userId: string,
): Promise<Map<string, string[]>> {
    const byItem = new Map<string, string[]>();
    if (itemIds.length === 0) return byItem;

    const rows = await db
        .select({
            itemId: mediaReaction.itemId,
            reaction: mediaReaction.reaction,
        })
        .from(mediaReaction)
        .where(
            and(
                inArray(mediaReaction.itemId, itemIds),
                eq(mediaReaction.userId, userId),
            ),
        );

    for (const row of rows) {
        const existing = byItem.get(row.itemId);
        if (existing) {
            existing.push(row.reaction);
        } else {
            byItem.set(row.itemId, [row.reaction]);
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
