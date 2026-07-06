/**
 * Opt-in media catalog tagging for gen.pollinations.ai generations.
 *
 * Requests without `tag`/`tags` params are untouched — no D1 write, no extra
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
    InvalidTagError,
    normalizeTags,
    TooManyTagsError,
    upsertGenerationCatalogItem,
} from "@shared/media-catalog.ts";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { EXCLUDED_PARAMS } from "@/utils/media-cache.ts";

const CATALOG_HOST = "https://gen.pollinations.ai";
const MAX_PROMPT_LENGTH = 2000;

type MediaCatalogEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

// Splits a comma-separated `tags` value and merges it with repeated `tag`
// params — same shape as media.pollinations.ai's collectTags.
function collectTags(searchParams: URLSearchParams): string[] {
    const tags = [...searchParams.getAll("tag")];
    const tagsParam = searchParams.get("tags");
    if (tagsParam) {
        tags.push(...tagsParam.split(","));
    }
    return tags;
}

// Canonical locator: full URL on the constant gen host, pathname unchanged,
// query params sorted alphabetically with catalog/cache-excluded params
// stripped. Two requests for the "same" generation that differ only by tag
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

// Extracts and decodes the prompt segment following `/image/` or `/video/` in
// the request path, truncated to MAX_PROMPT_LENGTH.
function extractPrompt(pathname: string): string | null {
    const match = pathname.match(/^\/(?:image|video)\/([\s\S]+)$/);
    if (!match) return null;
    const raw = match[1];
    let decoded: string;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        decoded = raw;
    }
    return decoded.slice(0, MAX_PROMPT_LENGTH);
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
            if (error instanceof InvalidTagError) {
                return c.json({ error: `Invalid tag: "${error.tag}"` }, 400);
            }
            if (error instanceof TooManyTagsError) {
                return c.json(
                    { error: `Too many tags: ${error.count} (max 8)` },
                    400,
                );
            }
            throw error;
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
        const prompt = extractPrompt(url.pathname);
        const model = c.var.model?.resolved ?? null;
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
                model,
                prompt,
                tags,
            }).catch((error) => {
                log.error("Failed to write media catalog item: {error}", {
                    error,
                });
            }),
        );
    },
);
