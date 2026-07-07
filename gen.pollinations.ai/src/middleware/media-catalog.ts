/**
 * Opt-in media catalog tagging for gen.pollinations.ai generations.
 *
 * Requests without `tags` params are untouched — no D1 write, no extra
 * work on the hot path. Requests with tags are validated up front (before any
 * GPU cost is incurred), then — once the generation succeeds — the response
 * is cataloged into the shared media_item/media_tag tables (same D1 database
 * media.pollinations.ai uses for uploads).
 *
 * Must run BEFORE imageCache in the middleware chain: its `await next()`
 * wraps the cache middleware, so tagging fires on both cache hits and fresh
 * generations (see proxy.ts's imageVideoHandlers).
 */

import {
    normalizeTags,
    TagError,
    upsertGenerationCatalogItem,
} from "@shared/media-catalog.ts";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { EXCLUDED_PARAMS } from "@/utils/media-cache.ts";

const CATALOG_HOST = "https://gen.pollinations.ai";

type MediaCatalogEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

// Splits comma-separated `tags` values. Same field name as
// media.pollinations.ai upload metadata.
function collectTags(searchParams: URLSearchParams): string[] {
    const tags: string[] = [];
    for (const value of searchParams.getAll("tags")) {
        tags.push(...value.split(","));
    }
    return tags;
}

// Canonical locator: full URL on the constant gen host, pathname unchanged,
// query params sorted alphabetically with catalog/cache-excluded params
// stripped. Two requests for the "same" generation that differ only by tags
// (or any excluded param) resolve to the same locator, so upsert merges them.
function buildCanonicalLocator(url: URL): string {
    const params = Array.from(url.searchParams.entries())
        .filter(([key]) => !EXCLUDED_PARAMS.includes(key))
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    const search = new URLSearchParams();
    for (const [key, value] of params) {
        search.append(key, value);
    }
    const query = search.toString();

    return `${CATALOG_HOST}${url.pathname}${query ? `?${query}` : ""}`;
}

export const mediaCatalog = createMiddleware<MediaCatalogEnv>(
    async (c, next) => {
        const url = new URL(c.req.url);
        const rawTags = collectTags(url.searchParams);

        if (rawTags.length === 0) {
            await next();
            return;
        }

        let tags: string[];
        try {
            tags = normalizeTags(rawTags);
        } catch (error) {
            if (error instanceof TagError) {
                return c.json({ error: error.message }, 400);
            }
            throw error;
        }

        // `?tags=` (or only empty/whitespace values) normalizes to nothing —
        // treat it like no tags at all rather than requiring auth and
        // writing a tagless catalog row.
        if (tags.length === 0) {
            await next();
            return;
        }

        const ownerUserId = c.var.auth?.user?.id;
        if (!ownerUserId) {
            return c.json(
                { error: "tagging requires a user-owned API key" },
                400,
            );
        }

        await next();

        if (c.res.status !== 200) return;

        const locator = buildCanonicalLocator(url);
        const appKeyId = c.var.auth?.apiKey?.byopClientKeyId ?? null;
        const contentType =
            c.res.headers.get("content-type") || "application/octet-stream";
        const log = c.get("log");

        c.executionCtx.waitUntil(
            upsertGenerationCatalogItem(drizzle(c.env.DB), {
                ownerUserId,
                appKeyId,
                locator,
                contentType,
                tags,
            }).catch((error) => {
                log.error("Failed to write media catalog item: {error}", {
                    error,
                });
            }),
        );
    },
);
