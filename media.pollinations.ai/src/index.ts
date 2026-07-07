import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
    describeRoute,
    openAPIRouteHandler,
    resolver,
    validator,
} from "hono-openapi";
import { z } from "zod";
import type { CatalogDb, CatalogItem, CatalogPage } from "./catalog.ts";
import {
    addReaction,
    DEFAULT_LIMIT,
    decodeCursor,
    getDb,
    InvalidReactionError,
    isItemReactable,
    listByTag,
    listUserMedia,
    MAX_LIMIT,
    MAX_REACTION_KINDS_PER_ITEM,
    normalizeReaction,
    normalizeTags,
    reactionCountForItem,
    reactionCountsForItems,
    removeReaction,
    TagError,
    tagsForItems,
    upsertUploadCatalogItem,
    userReactionsForItems,
} from "./catalog.ts";

const DOMAIN = "media.pollinations.ai";
// gen.pollinations.ai proxies /account/* to enter — using the public path
// keeps internal services consistent with the documented SDK/external usage.
const KEY_VERIFY_URL = "https://gen.pollinations.ai/account/key";
// Keep in sync with shared/http/cache-control.ts (IMMUTABLE_CACHE_CONTROL).
// Content-addressed storage means the URL → bytes mapping is fixed forever:
// re-uploading the
// same content reproduces the same URL, and there is no other content the URL
// could ever point to. R2's 30-day lifecycle can delete the underlying object,
// but a fresh upload restores byte-identical content, so `immutable` is safe.
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASH_PATTERN = /^[a-f0-9]{16}$/i;
const DEFAULT_MAX_SIZE = 52428800; // 50 MB

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
    DB: D1Database;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    userId: string | null;
    byopClientKeyId: string | null;
}

async function verifyApiKey(apiKey: string): Promise<AuthResult | null> {
    try {
        const res = await fetch(KEY_VERIFY_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const data = await res.json<AuthResult>();
        return data.valid ? data : null;
    } catch {
        return null;
    }
}

function extractApiKey(req: Request): string | null {
    const bearer = req.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) return bearer;
    return new URL(req.url).searchParams.get("key");
}

function fileTooLargeError(maxSize: number): { error: string } {
    return { error: `File too large. Max size: ${maxSize / 1024 / 1024}MB` };
}

function mediaUrl(hash: string): string {
    return `https://${DOMAIN}/${hash}`;
}

// Splits comma-separated `tags` values. Accepts the same field name whether it
// came from a query string, multipart form field, or JSON body field. Non-string
// entries (possible from an arbitrary JSON body) are ignored rather than throwing.
function splitTags(values: unknown[]): string[] {
    const tags: string[] = [];
    for (const value of values) {
        if (typeof value !== "string") continue;
        tags.push(...value.split(","));
    }
    return tags;
}

function collectTags(getAll: (key: string) => string[]): string[] {
    return splitTags(getAll("tags"));
}

class TagValidationError extends Error {}

function validateTags(rawTags: string[]): string[] {
    try {
        return normalizeTags(rawTags);
    } catch (error) {
        if (error instanceof TagError) {
            throw new TagValidationError(error.message);
        }
        throw error;
    }
}

const REACTION_PATTERN_DESCRIPTION =
    "lowercase letters, digits, and _- (not leading), max 32 chars";

// Item shape shared by /me/media and /tags/:tag — never exposes
// ownerUserId/appKeyId.
interface MediaItemResponse {
    id: string;
    url: string;
    contentType: string;
    size: number | null;
    tags: string[];
    createdAt: string;
    reactions: Record<string, number>;
    myReactions?: string[];
}

function toItemResponse(
    item: CatalogItem,
    tagsByItem: Map<string, string[]>,
    reactionsByItem: Map<string, Record<string, number>>,
    myReactionsByItem: Map<string, string[]> | null,
): MediaItemResponse {
    return {
        id: item.id,
        url: mediaUrl(item.locator),
        contentType: item.contentType,
        size: item.size,
        tags: tagsByItem.get(item.id) ?? [],
        createdAt: item.createdAt.toISOString(),
        reactions: reactionsByItem.get(item.id) ?? {},
        ...(myReactionsByItem
            ? { myReactions: myReactionsByItem.get(item.id) ?? [] }
            : {}),
    };
}

// `myReactionsUserId` is the authenticated user's id when myReactions should
// be computed and included, or null when it should be omitted entirely (no
// key, or a valid key with no attached user).
async function toPageResponse(
    db: ReturnType<typeof getDb>,
    page: CatalogPage,
    myReactionsUserId: string | null,
): Promise<{ items: MediaItemResponse[]; nextCursor: string | null }> {
    const itemIds = page.items.map((item) => item.id);
    const [tagsByItem, reactionsByItem, myReactionsByItem] = await Promise.all([
        tagsForItems(db, itemIds),
        reactionCountsForItems(db, itemIds),
        myReactionsUserId
            ? userReactionsForItems(db, itemIds, myReactionsUserId)
            : Promise.resolve(null),
    ]);
    return {
        items: page.items.map((item) =>
            toItemResponse(
                item,
                tagsByItem,
                reactionsByItem,
                myReactionsByItem,
            ),
        ),
        nextCursor: page.nextCursor,
    };
}

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
    tags: z
        .array(z.string())
        .optional()
        .describe("Tags stored for this upload, present only when tagged"),
});

const ErrorSchema = z.object({
    error: z.string(),
});

const MetadataResponseSchema = z.object({
    hash: z.string().describe("16-char hex content hash"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    uploadedAt: z
        .string()
        .optional()
        .describe("ISO-8601 upload timestamp, when recorded"),
});

const MediaItemResponseSchema = z.object({
    id: z.string().describe("Catalog item id"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().nullable().describe("File size in bytes"),
    tags: z.array(z.string()),
    createdAt: z.string().describe("ISO-8601 timestamp"),
    reactions: z
        .record(z.string(), z.number().int())
        .describe(
            "Reaction counts by kind (e.g. {like: 3}). {} when the item has no reactions.",
        ),
    myReactions: z
        .array(z.string())
        .optional()
        .describe(
            "Reaction kinds the authenticated caller gave this item. Present only when computable: always on /me/media, and on /tags/:tag only when an API key with an attached user was supplied.",
        ),
});

const MediaPageResponseSchema = z.object({
    items: z.array(MediaItemResponseSchema),
    nextCursor: z
        .string()
        .nullable()
        .describe("Opaque cursor for the next page, null when exhausted"),
});

const ReactionResponseSchema = z.object({
    reaction: z.string().describe("Normalized reaction kind"),
    reacted: z
        .boolean()
        .describe("true after adding the reaction, false after removing it"),
    count: z
        .number()
        .int()
        .describe(
            "Total reactions of this kind on this item after the mutation",
        ),
});

// Query-param schemas for the listing routes, used with validator("query", …):
// one schema that both validates and documents. `limit` is a coerced integer
// (query values arrive as strings) bounded to [1, MAX_LIMIT]; non-numeric,
// out-of-range, or repeated values are rejected with a 400 — the standard
// behavior for a scalar param. `cursor` and `tag` are plain optional strings.
const MediaListQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .optional()
        .describe(`Page size, 1–${MAX_LIMIT}. Omitted → ${DEFAULT_LIMIT}.`),
    cursor: z
        .string()
        .optional()
        .describe(
            "Opaque pagination cursor from a previous response's nextCursor.",
        ),
});

const MyMediaQuerySchema = MediaListQuerySchema.extend({
    tag: z
        .string()
        .optional()
        .describe("Restrict the listing to items carrying this tag."),
});

// Path params for the reaction routes, described for the docs. hono derives
// the params from the route path, but supplying `parameters` attaches prose.
const REACTION_PATH_PARAMS = [
    {
        name: "id",
        in: "path",
        required: true,
        description:
            "Catalog item id (the `id` field from /me/media or /tags/:tag, not the content hash).",
        schema: { type: "string" },
    },
    {
        name: "reaction",
        in: "path",
        required: true,
        description: "Reaction kind, e.g. `like`, `heart`, `bookmark`.",
        schema: { type: "string" },
    },
] as const;

const api = new Hono<{ Bindings: Env }>();

// Shared preamble for the reaction routes: authenticate, validate the
// reaction slug, and check the item is reactable (own or publicly tagged).
// Returns the resolved context, or an early error Response the caller should
// return as-is.
async function resolveReactionRequest(
    c: Context<{ Bindings: Env }>,
): Promise<
    { db: CatalogDb; id: string; userId: string; reaction: string } | Response
> {
    const apiKey = extractApiKey(c.req.raw);
    if (!apiKey) {
        return c.json(
            {
                error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>",
            },
            401,
        );
    }
    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
        return c.json({ error: "Invalid or expired API key" }, 401);
    }
    if (authResult.userId === null) {
        return c.json(
            { error: "This API key is not attached to a user account" },
            403,
        );
    }

    let reaction: string;
    try {
        reaction = normalizeReaction(c.req.param("reaction"));
    } catch (error) {
        if (error instanceof InvalidReactionError) {
            return c.json(
                {
                    error: `Invalid reaction: "${error.reaction}". Reactions must match ${REACTION_PATTERN_DESCRIPTION}.`,
                },
                400,
            );
        }
        throw error;
    }

    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    if (!(await isItemReactable(db, id, authResult.userId))) {
        return c.json({ error: "Media item not found" }, 404);
    }

    return { db, id, userId: authResult.userId, reaction };
}

api.post(
    "/upload",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Upload media",
        description:
            "Upload an image, audio, or video file via multipart/form-data (field `file`) or application/json (base64 `data`). Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Files are retained for 30 days; re-uploading resets the timer. An optional `tags` field catalogs the upload to your media library and makes it publicly visible on /tags/:tag. **Alpha:** the catalog tagging is new and may still change.",
        requestBody: {
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        required: ["file"],
                        properties: {
                            file: {
                                type: "string",
                                format: "binary",
                                description: "The media file to upload.",
                            },
                            tags: {
                                type: "string",
                                description:
                                    "Comma-separated catalog tags (makes the item public).",
                            },
                        },
                    },
                },
                "application/json": {
                    schema: {
                        type: "object",
                        required: ["data"],
                        properties: {
                            data: {
                                type: "string",
                                description:
                                    "Base64-encoded file bytes (with or without a data: prefix).",
                            },
                            contentType: {
                                type: "string",
                                description:
                                    "MIME type; defaults to application/octet-stream.",
                            },
                            name: {
                                type: "string",
                                description:
                                    "Filename; participates in the content hash.",
                            },
                            tags: {
                                oneOf: [
                                    { type: "string" },
                                    {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                ],
                                description:
                                    "Catalog tags (makes the item public): a comma-separated string or an array of strings.",
                            },
                        },
                    },
                },
            },
        },
        responses: {
            200: {
                description: "Upload successful",
                content: {
                    "application/json": {
                        schema: resolver(UploadResponseSchema),
                    },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            413: {
                description: "File too large (max 50MB)",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const apiKey = extractApiKey(c.req.raw);
        if (!apiKey) {
            return c.json(
                {
                    error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>",
                },
                401,
            );
        }
        const authResult = await verifyApiKey(apiKey);
        if (!authResult) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }

        const maxSize = parseInt(c.env.MAX_FILE_SIZE, 10) || DEFAULT_MAX_SIZE;

        // Fail fast: reject oversized requests before reading the body into memory
        const contentLength = parseInt(
            c.req.header("content-length") || "0",
            10,
        );
        if (contentLength > maxSize) {
            return c.json(fileTooLargeError(maxSize), 413);
        }

        let fileBuffer: ArrayBuffer;
        let contentType: string;
        let fileName: string | undefined;

        const requestContentType = c.req.header("content-type") || "";
        const queryUrl = new URL(c.req.url);
        const rawTags = collectTags((key) => queryUrl.searchParams.getAll(key));

        try {
            if (requestContentType.includes("multipart/form-data")) {
                const formData = await c.req.formData();
                const file = formData.get("file") as File | null;

                if (!(file instanceof File)) {
                    return c.json(
                        {
                            error: "No file provided. Use 'file' field in form-data.",
                        },
                        400,
                    );
                }

                if (file.size > maxSize) {
                    return c.json(fileTooLargeError(maxSize), 413);
                }

                fileBuffer = await file.arrayBuffer();
                contentType = file.type || detectContentType(file.name);
                fileName = file.name;

                rawTags.push(
                    ...collectTags((key) =>
                        formData
                            .getAll(key)
                            .filter(
                                (value): value is string =>
                                    typeof value === "string",
                            ),
                    ),
                );
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
                    tags?: string | string[];
                }>();

                if (!body.data) {
                    return c.json(
                        { error: "Missing 'data' field in JSON body" },
                        400,
                    );
                }

                const base64Data = body.data.includes(",")
                    ? body.data.split(",")[1]
                    : body.data;
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                fileBuffer = bytes.buffer;

                if (fileBuffer.byteLength > maxSize) {
                    return c.json(fileTooLargeError(maxSize), 413);
                }
                if (fileBuffer.byteLength === 0) {
                    return c.json({ error: "Empty file" }, 400);
                }

                contentType = body.contentType || "application/octet-stream";
                fileName = body.name;

                // Accept `tags` as either a comma-separated string or a JSON
                // array of strings — both are natural in a JSON body.
                if (body.tags) {
                    const tagValues = Array.isArray(body.tags)
                        ? body.tags
                        : [body.tags];
                    rawTags.push(...splitTags(tagValues));
                }
            } else {
                return c.json(
                    {
                        error: "Unsupported content type. Use multipart/form-data (field `file`) or application/json (base64 `data`).",
                    },
                    400,
                );
            }

            let tags: string[];
            try {
                tags = validateTags(rawTags);
            } catch (error) {
                if (error instanceof TagValidationError) {
                    return c.json({ error: error.message }, 400);
                }
                throw error;
            }

            if (authResult.userId === null && tags.length > 0) {
                return c.json(
                    { error: "cataloging requires a user-owned API key" },
                    400,
                );
            }

            const hash = await generateHash(fileBuffer, fileName);

            const existing = await c.env.MEDIA_BUCKET.head(hash);

            // Always re-PUT to reset the R2 object timestamp (resets lifecycle TTL).
            await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
                httpMetadata: {
                    contentType,
                    cacheControl: CACHE_CONTROL,
                },
                customMetadata: {
                    uploadedAt: new Date().toISOString(),
                    originalName: fileName || "",
                    uploadedBy: authResult.name || "",
                    keyType: authResult.type,
                },
            });

            // Catalog write is awaited inline (not waitUntil): a D1 failure
            // must surface as a 500, not be silently swallowed. Every upload
            // by a user-owned key is cataloged (personal media library);
            // keys with no user never catalog — tags on them were rejected
            // above, and without one there's no owner to attribute a row to.
            let storedTags: string[] | undefined;
            if (authResult.userId !== null) {
                const db = getDb(c.env.DB);
                await upsertUploadCatalogItem(db, {
                    ownerUserId: authResult.userId,
                    appKeyId: authResult.byopClientKeyId,
                    locator: hash,
                    contentType,
                    size: fileBuffer.byteLength,
                    tags,
                });
                storedTags = tags;
            }

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    duplicate: !!existing,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                ...(storedTags && storedTags.length > 0
                    ? { tags: storedTags }
                    : {}),
            });
        } catch (error) {
            console.error("Upload error:", error);
            return c.json({ error: "Upload failed" }, 500);
        }
    },
);

api.get(
    "/me/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List your cataloged media",
        description:
            "List media items owned by the authenticated user, newest first. Optionally filter by tag. Upload-backed items reference storage that expires 30 days after their last upload — an expired item keeps its catalog entry, but its url 404s until the same content is re-uploaded. **Alpha:** this endpoint is new and its API may still change.",
        responses: {
            200: {
                description: "Page of media items",
                content: {
                    "application/json": {
                        schema: resolver(MediaPageResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid cursor or limit",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            403: {
                description: "API key is not attached to a user account",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    validator("query", MyMediaQuerySchema),
    async (c) => {
        const apiKey = extractApiKey(c.req.raw);
        if (!apiKey) {
            return c.json(
                {
                    error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>",
                },
                401,
            );
        }
        const authResult = await verifyApiKey(apiKey);
        if (!authResult) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }
        if (authResult.userId === null) {
            return c.json(
                { error: "This API key is not attached to a user account" },
                403,
            );
        }

        const query = c.req.valid("query");
        const limit = query.limit ?? DEFAULT_LIMIT;
        let cursor: { createdAt: Date; id: string } | undefined;
        if (query.cursor) {
            try {
                cursor = decodeCursor(query.cursor);
            } catch {
                return c.json({ error: "Invalid cursor" }, 400);
            }
        }

        const db = getDb(c.env.DB);
        const page = await listUserMedia(db, {
            ownerUserId: authResult.userId,
            tag: query.tag,
            limit,
            cursor,
        });

        return c.json(await toPageResponse(db, page, authResult.userId));
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Browse media by tag",
        description:
            "Public gallery listing for a tag, ordered by when each item was tagged, newest first. Authentication is optional: pass an API key to get `myReactions` on each item. Upload-backed items reference storage that expires 30 days after their last upload — an expired item keeps its catalog entry, but its url 404s until the same content is re-uploaded. **Alpha:** this endpoint is new and its API may still change.",
        security: [],
        parameters: [
            {
                name: "tag",
                in: "path",
                required: true,
                description: "Tag slug to list, e.g. `gallery`.",
                schema: { type: "string" },
            },
        ],
        responses: {
            200: {
                description: "Page of media items",
                content: {
                    "application/json": {
                        schema: resolver(MediaPageResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid cursor or limit",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "API key supplied but invalid or expired",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    validator("query", MediaListQuerySchema),
    async (c) => {
        const tag = c.req.param("tag");
        const query = c.req.valid("query");
        const limit = query.limit ?? DEFAULT_LIMIT;
        let cursor: { createdAt: Date; id: string } | undefined;
        if (query.cursor) {
            try {
                cursor = decodeCursor(query.cursor);
            } catch {
                return c.json({ error: "Invalid cursor" }, 400);
            }
        }

        // Auth is optional here, but if a key IS supplied it must be valid —
        // an invalid key fails fast rather than silently falling back to
        // anonymous browsing.
        let myReactionsUserId: string | null = null;
        const apiKey = extractApiKey(c.req.raw);
        if (apiKey) {
            const authResult = await verifyApiKey(apiKey);
            if (!authResult) {
                return c.json({ error: "Invalid or expired API key" }, 401);
            }
            myReactionsUserId = authResult.userId;
        }

        const db = getDb(c.env.DB);
        const page = await listByTag(db, { tag, limit, cursor });

        return c.json(await toPageResponse(db, page, myReactionsUserId));
    },
);

api.put(
    "/media/:id/reactions/:reaction",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "React to a media item",
        description:
            "Add a reaction (e.g. `like`, `heart`, `bookmark`) to a catalog item by its id (the `id` field from /me/media or /tags/:tag, not the content hash). Reactable items are your own plus anything publicly tagged; others answer 404. Idempotent: repeating the same reaction is a no-op. At most 8 distinct reaction kinds per user per item. **Alpha:** this endpoint is new and its API may still change.",
        parameters: [...REACTION_PATH_PARAMS],
        responses: {
            200: {
                description:
                    "Current reaction state and total count for this kind",
                content: {
                    "application/json": {
                        schema: resolver(ReactionResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid reaction kind",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            403: {
                description: "API key is not attached to a user account",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            404: {
                description: "Media item not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const resolved = await resolveReactionRequest(c);
        if (resolved instanceof Response) return resolved;
        const { db, id, userId, reaction } = resolved;

        const added = await addReaction(db, id, userId, reaction);
        if (!added) {
            // Zero rows written: either an idempotent repeat of a kind this
            // user already holds, or the atomic kind cap inside addReaction
            // refused a new kind. Only the second is an error.
            const existingKinds =
                (await userReactionsForItems(db, [id], userId)).get(id) ?? [];
            if (!existingKinds.includes(reaction)) {
                return c.json(
                    {
                        error: `Too many distinct reactions on this item (max ${MAX_REACTION_KINDS_PER_ITEM} kinds per user).`,
                    },
                    400,
                );
            }
        }
        const count = await reactionCountForItem(db, id, reaction);
        return c.json({ reaction, reacted: true, count });
    },
);

api.delete(
    "/media/:id/reactions/:reaction",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Remove a reaction from a media item",
        description:
            "Remove your reaction of one kind from a catalog item by its id (the `id` field from /me/media or /tags/:tag, not the content hash). Reactable items are your own plus anything publicly tagged; others answer 404. Idempotent: removing a reaction you haven't given is a no-op. **Alpha:** this endpoint is new and its API may still change.",
        parameters: [...REACTION_PATH_PARAMS],
        responses: {
            200: {
                description:
                    "Current reaction state and total count for this kind",
                content: {
                    "application/json": {
                        schema: resolver(ReactionResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid reaction kind",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            403: {
                description: "API key is not attached to a user account",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            404: {
                description: "Media item not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const resolved = await resolveReactionRequest(c);
        if (resolved instanceof Response) return resolved;
        const { db, id, userId, reaction } = resolved;

        await removeReaction(db, id, userId, reaction);
        const count = await reactionCountForItem(db, id, reaction);
        return c.json({ reaction, reacted: false, count });
    },
);

api.get(
    "/:hash",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Retrieve media",
        description:
            "Get a file by its content hash. Access keeps files from expiring.",
        security: [],
        responses: {
            200: { description: "File content with appropriate Content-Type" },
            400: {
                description: "Invalid hash format",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            404: {
                description: "File not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const hash = c.req.param("hash");

        if (!HASH_PATTERN.test(hash)) {
            return c.json({ error: "Invalid hash format" }, 400);
        }

        try {
            const object = await c.env.MEDIA_BUCKET.get(hash);

            if (!object) {
                return c.json({ error: "Not found" }, 404);
            }

            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("Cache-Control", CACHE_CONTROL);
            headers.set("X-Content-Hash", hash);
            headers.set("X-Content-Size", object.size.toString());

            const originalName = object.customMetadata?.originalName;
            if (originalName) {
                // RFC 5987: use filename* with UTF-8 encoding to safely handle any characters
                const sanitized = encodeURIComponent(originalName);
                headers.set(
                    "Content-Disposition",
                    `inline; filename*=UTF-8''${sanitized}`,
                );
            }

            const responseBody = refreshR2ObjectTtl(
                c.env.MEDIA_BUCKET,
                hash,
                object,
                (promise) => c.executionCtx.waitUntil(promise),
                (error) => {
                    console.error("TTL refresh error:", error);
                },
            );

            return new Response(responseBody, { headers });
        } catch (error) {
            console.error("Retrieve error:", error);
            return c.json({ error: "Retrieval failed" }, 500);
        }
    },
);

api.get(
    "/:hash/metadata",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Get file metadata",
        description:
            "Return file metadata (hash, content type, size, upload timestamp) as JSON without downloading the file body.",
        security: [],
        responses: {
            200: {
                description: "File metadata",
                content: {
                    "application/json": {
                        schema: resolver(MetadataResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid hash format",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            404: {
                description: "File not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const hash = c.req.param("hash");

        if (!HASH_PATTERN.test(hash)) {
            return c.json({ error: "Invalid hash format" }, 400);
        }

        try {
            const object = await c.env.MEDIA_BUCKET.head(hash);

            if (!object) {
                return c.json({ error: "Not found" }, 404);
            }

            c.header("Cache-Control", CACHE_CONTROL);
            return c.json({
                hash,
                contentType:
                    object.httpMetadata?.contentType ||
                    "application/octet-stream",
                size: object.size,
                ...(object.customMetadata?.uploadedAt && {
                    uploadedAt: object.customMetadata.uploadedAt,
                }),
            });
        } catch (error) {
            console.error("Metadata error:", error);
            return c.json({ error: "Metadata lookup failed" }, 500);
        }
    },
);

api.on(
    "HEAD",
    "/:hash",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Check if media exists",
        description:
            "Check existence and metadata without downloading the file.",
        security: [],
        responses: {
            200: {
                description:
                    "File exists (headers include Content-Type, Content-Length, X-Content-Hash)",
            },
            400: { description: "Invalid hash format" },
            404: { description: "File not found" },
        },
    }),
    async (c) => {
        const hash = c.req.param("hash");

        if (!HASH_PATTERN.test(hash)) {
            return new Response(null, { status: 400 });
        }

        try {
            const object = await c.env.MEDIA_BUCKET.head(hash);

            if (!object) {
                return new Response(null, { status: 404 });
            }

            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("Content-Length", object.size.toString());
            headers.set("Cache-Control", CACHE_CONTROL);
            headers.set("X-Content-Hash", hash);

            if (object.customMetadata?.uploadedAt) {
                headers.set("X-Uploaded-At", object.customMetadata.uploadedAt);
            }

            return new Response(null, { status: 200, headers });
        } catch {
            return new Response(null, { status: 500 });
        }
    },
);

const app = new Hono<{ Bindings: Env }>();

app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Content-Hash", "X-Content-Size"],
    }),
);

app.get("/", (c) => {
    return c.json({
        service: DOMAIN,
        version: "1.0.0",
        endpoints: {
            upload: "POST /upload (requires API key; optional tags)",
            retrieve: "GET /:hash",
            metadata: "GET /:hash/metadata",
            myMedia: "GET /me/media (requires user-owned API key)",
            tagGallery:
                "GET /tags/:tag (public; optional API key for myReactions)",
            react: "PUT /media/:id/reactions/:reaction (requires user-owned API key)",
            unreact:
                "DELETE /media/:id/reactions/:reaction (requires user-owned API key)",
            docs: "GET /openapi.json",
        },
        limits: {
            maxFileSize: "50MB",
        },
    });
});

app.get("/openapi.json", async (c, next) => {
    const handler = openAPIRouteHandler(api, {
        documentation: {
            info: {
                title: "media.pollinations.ai",
                version: "1.0.0",
                description:
                    "Content-addressed media storage. Upload images, audio, and video with deduplication via SHA-256 hashing. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public. The catalog features (tags, galleries, reactions) are **alpha** — their API may still change.",
            },
            servers: [{ url: `https://${DOMAIN}` }],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "API Key",
                        description: "pollinations.ai API key (pk_ or sk_)",
                    },
                },
            },
            security: [{ bearerAuth: [] }],
        },
    });
    const response = await handler(c, next);
    if (!response) return;
    const schema = await response.json();
    return c.json(schema);
});

app.route("/", api);

// 16 hex chars = 64 bits -- collision expected around ~4B files (birthday paradox)
// Hash includes filename so the same content with different names gets different URLs.
async function generateHash(
    buffer: ArrayBuffer,
    fileName?: string,
): Promise<string> {
    const nameBytes = new TextEncoder().encode(fileName || "");
    const separator = new Uint8Array([0x00]); // null byte for domain separation
    const combined = new Uint8Array(
        buffer.byteLength + separator.length + nameBytes.length,
    );
    combined.set(new Uint8Array(buffer), 0);
    combined.set(separator, buffer.byteLength);
    combined.set(nameBytes, buffer.byteLength + separator.length);
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        combined.buffer.slice(
            combined.byteOffset,
            combined.byteOffset + combined.byteLength,
        ),
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 16);
}

const MIME_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    aac: "audio/aac",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
};

function detectContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return MIME_TYPES[ext] || "application/octet-stream";
}

export default app;
