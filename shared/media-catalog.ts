// Media catalog helpers for gen.pollinations.ai: opt-in tagging of
// generations into the shared media catalog (same D1 tables media.pollinations.ai
// uses for uploads — see shared/db/media-catalog.ts and
// media.pollinations.ai/src/catalog.ts for the reference upload implementation).

import { mediaItem, mediaTag } from "@shared/db/media-catalog.ts";
import type { drizzle } from "drizzle-orm/d1";

type CatalogDb = ReturnType<typeof drizzle>;

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

export interface UpsertGenerationCatalogItemParams {
    ownerUserId: string;
    appKeyId: string | null;
    locator: string;
    contentType: string;
    model: string | null;
    prompt: string | null;
    tags: string[];
}

/**
 * Upsert a catalog row for a generation (keyed on ownerUserId+locator), then
 * merge in any tags. Returns the catalog item id.
 */
export async function upsertGenerationCatalogItem(
    db: CatalogDb,
    params: UpsertGenerationCatalogItemParams,
): Promise<string> {
    const now = new Date();
    const [row] = await db
        .insert(mediaItem)
        .values({
            id: crypto.randomUUID(),
            kind: "generation",
            locator: params.locator,
            contentHash: null,
            ownerUserId: params.ownerUserId,
            appKeyId: params.appKeyId,
            contentType: params.contentType,
            size: null,
            model: params.model,
            prompt: params.prompt,
            createdAt: now,
        })
        .onConflictDoUpdate({
            target: [mediaItem.ownerUserId, mediaItem.locator],
            set: {
                createdAt: now,
                contentType: params.contentType,
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
