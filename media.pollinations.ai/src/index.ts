import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
    describeRoute,
    openAPIRouteHandler,
    resolver,
    validator,
} from "hono-openapi";
import { z } from "zod";
import type { CatalogItem, CatalogPage } from "./catalog.ts";
import {
    catalogItemOwner,
    DEFAULT_LIMIT,
    decodeCursor,
    deleteCatalogItem,
    getDb,
    insertUploadCatalogItem,
    listMedia,
    MAX_LIMIT,
    normalizeTags,
    TagError,
    tagsForItems,
} from "./catalog.ts";

const DOMAIN = "media.pollinations.ai";
// gen.pollinations.ai proxies /account/* to enter — using the public path
// keeps internal services consistent with the documented SDK/external usage.
const KEY_VERIFY_URL = "https://gen.pollinations.ai/account/key";
// Keep in sync with shared/http/cache-control.ts (IMMUTABLE_CACHE_CONTROL).
// Each upload gets a unique id that is also its R2 key, so a given id maps to
// one immutable set of bytes forever — safe to cache indefinitely. R2's 30-day
// lifecycle may delete the object, but the id is never reused for other bytes.
const CACHE_CONTROL = "public, max-age=31536000, immutable";
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
        if (!data.valid) return null;
        // Normalize: an enter deployment that predates the identity fields
        // omits them, and `undefined` would slip past the `=== null` guards
        // downstream — never treat an unattested key as user-attached.
        return {
            valid: true,
            type: data.type,
            name: data.name ?? null,
            userId: data.userId ?? null,
            byopClientKeyId: data.byopClientKeyId ?? null,
        };
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

function mediaUrl(id: string): string {
    return `https://${DOMAIN}/${id}`;
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

// Item shape returned by GET /media — never exposes ownerUserId/appKeyId.
interface MediaItemResponse {
    id: string;
    url: string;
    contentType: string;
    size: number | null;
    tags: string[];
    createdAt: string;
}

function toItemResponse(
    item: CatalogItem,
    tagsByItem: Map<string, string[]>,
): MediaItemResponse {
    return {
        id: item.id,
        url: mediaUrl(item.id),
        contentType: item.contentType,
        size: item.size,
        tags: tagsByItem.get(item.id) ?? [],
        createdAt: item.createdAt.toISOString(),
    };
}

async function toPageResponse(
    db: ReturnType<typeof getDb>,
    page: CatalogPage,
): Promise<{
    items: MediaItemResponse[];
    nextCursor: string | null;
    hasMore: boolean;
}> {
    const itemIds = page.items.map((item) => item.id);
    const tagsByItem = await tagsForItems(db, itemIds);
    return {
        items: page.items.map((item) => toItemResponse(item, tagsByItem)),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
    };
}

const UploadResponseSchema = z.object({
    id: z.string().describe("Unique media id (also the retrieval id)"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    tags: z
        .array(z.string())
        .optional()
        .describe(
            "Tags the upload was published with; present only when tagged",
        ),
});

const ErrorSchema = z.object({
    error: z.string(),
});

const MetadataResponseSchema = z.object({
    id: z.string().describe("Unique media id"),
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
});

const MediaPageResponseSchema = z.object({
    items: z.array(MediaItemResponseSchema),
    nextCursor: z
        .string()
        .nullable()
        .describe(
            "Opaque cursor for the next page, null when exhausted. Treat it as a token: pass it back verbatim as `?cursor=` to fetch the next page — do not parse or construct it.",
        ),
    hasMore: z
        .boolean()
        .describe(
            "true when more pages exist (nextCursor is non-null). Loop while hasMore is true.",
        ),
});

const DeleteResponseSchema = z.object({
    deleted: z.literal(true),
    id: z.string().describe("Id of the deleted media item"),
});

// Query-param schema for GET /media, used with validator("query", …): one
// schema that both validates and documents. `limit` is a coerced integer
// (query values arrive as strings) bounded to [1, MAX_LIMIT]; non-numeric,
// out-of-range, or repeated values are rejected with a 400 — the standard
// behavior for a scalar param. `cursor` is a plain optional string.
const MediaListQuerySchema = z.object({
    tag: z
        .string()
        .describe(
            "Required. The public gallery to list: items carrying this tag, any owner.",
        ),
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

const api = new Hono<{ Bindings: Env }>();

api.post(
    "/upload",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Upload media",
        description:
            "Upload an image, audio, or video file via multipart/form-data (field `file`) or application/json (base64 `data`). Returns a unique id and its retrieval URL; each upload gets its own id (re-uploading the same bytes yields a new one). Files are retained for 30 days.\n\n**Tags publish.** An optional `tags` field publishes the upload into each tag's public gallery (GET /media?tag=…), where anyone can see it. Untagged uploads stay unlisted: reachable only by their unguessable id URL, never listed anywhere. **Alpha:** the publish tagging is new and may still change.",
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
                                    "Comma-separated tags. Tagging publishes the upload to those tags' public galleries.",
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
                                    "Filename; used for the download Content-Disposition.",
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
                                    "Tags (publish the upload to those tags' public galleries): a comma-separated string or an array of strings.",
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
                    {
                        error: "publishing (tags) requires a user-owned API key",
                    },
                    400,
                );
            }

            // One id for everything: the R2 storage key, the retrieval id,
            // and (for user uploads) the catalog row id.
            const id = crypto.randomUUID();

            await c.env.MEDIA_BUCKET.put(id, fileBuffer, {
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

            // Tags are the publish action: only tagged uploads get catalog
            // rows (untagged uploads stay uncataloged blobs behind their
            // unguessable id). The write is awaited inline (not waitUntil):
            // a D1 failure must surface as a 500, not be silently swallowed.
            // `tags` non-empty implies a user-attached key (rejected above
            // otherwise), so ownerUserId is always real here.
            let storedTags: string[] | undefined;
            if (tags.length > 0 && authResult.userId !== null) {
                const db = getDb(c.env.DB);
                await insertUploadCatalogItem(db, {
                    id,
                    ownerUserId: authResult.userId,
                    appKeyId: authResult.byopClientKeyId,
                    contentType,
                    size: fileBuffer.byteLength,
                    tags,
                });
                storedTags = tags;
            }

            console.log(
                JSON.stringify({
                    event: "upload",
                    id,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                }),
            );

            return c.json({
                id,
                url: mediaUrl(id),
                contentType,
                size: fileBuffer.byteLength,
                ...(storedTags ? { tags: storedTags } : {}),
            });
        } catch (error) {
            console.error("Upload error:", error);
            return c.json({ error: "Upload failed" }, 500);
        }
    },
);

api.get(
    "/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List a public tag gallery",
        description:
            "List the public gallery for a tag: every published item carrying that tag, any owner, newest first. Tagging an upload is what publishes it, so galleries are fully public — no API key needed. `tag` is required.\n\nItems reference storage that expires 30 days after last access — an expired item keeps its catalog entry, but its url 404s. **Alpha:** this endpoint is new and its API may still change.",
        security: [],
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
                description: "Missing/empty tag, or invalid cursor or limit",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    validator("query", MediaListQuerySchema, (result, c) => {
        // Emit validation failures in the same {error} shape as every other
        // error response instead of the validator's default body.
        if (!result.success) {
            const issue = result.error[0];
            const path = issue?.path
                ?.map((p) =>
                    typeof p === "object" ? String(p.key) : String(p),
                )
                .join(".");
            return c.json(
                {
                    error: `Invalid query${path ? ` (${path})` : ""}: ${issue?.message ?? "validation failed"}`,
                },
                400,
            );
        }
    }),
    async (c) => {
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

        // Stored tags are trimmed + lowercased (normalizeTags), so the
        // lookup must match or exact-case queries silently return nothing.
        const tag = query.tag.trim().toLowerCase();
        if (tag === "") {
            return c.json(
                { error: "Invalid query (tag): must not be empty" },
                400,
            );
        }

        const db = getDb(c.env.DB);
        const page = await listMedia(db, { tag, limit, cursor });
        return c.json(await toPageResponse(db, page));
    },
);

api.delete(
    "/media/:id",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Delete media",
        description:
            "Delete a published media item you own: the file, its catalog entry, and all its tags are removed, so it disappears from galleries and its URL 404s. Requires your **secret (`sk_`)** API key. Untagged uploads were never published, have no catalog entry, and can't be deleted — they expire on their own 30 days after last access. **Alpha:** this endpoint is new and its API may still change.",
        parameters: [
            {
                name: "id",
                in: "path",
                required: true,
                description:
                    "Media id (from the upload response or GET /media).",
                schema: { type: "string" },
            },
        ],
        responses: {
            200: {
                description: "Item deleted",
                content: {
                    "application/json": {
                        schema: resolver(DeleteResponseSchema),
                    },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            403: {
                description:
                    "Key is not a secret (`sk_`) key, is not attached to a user account, or the item belongs to someone else",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            404: {
                description: "No published media item with this id",
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
        const auth = await verifyApiKey(apiKey);
        if (!auth) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }
        if (auth.userId === null) {
            return c.json(
                { error: "This API key is not attached to a user account" },
                403,
            );
        }
        // Publishable keys ship inside public clients — anyone holding one
        // could delete the owner's published media, so deletion is
        // secret-key only.
        if (auth.type !== "secret") {
            return c.json(
                { error: "Deleting media requires a secret (sk_) API key" },
                403,
            );
        }

        const id = c.req.param("id");
        const db = getDb(c.env.DB);
        // Only cataloged (published) items are deletable: an uncataloged id
        // has no owner record to authorize against, so it answers 404 just
        // like an unknown id.
        const owner = await catalogItemOwner(db, id);
        if (owner === undefined) {
            return c.json({ error: "Media item not found" }, 404);
        }
        if (owner !== auth.userId) {
            return c.json({ error: "You do not own this media item" }, 403);
        }

        // Catalog rows first (atomic batch), then the blob. If the R2 delete
        // fails the item is already unpublished and the orphaned blob expires
        // via the bucket's 30-day lifecycle.
        await deleteCatalogItem(db, id);
        await c.env.MEDIA_BUCKET.delete(id);

        console.log(
            JSON.stringify({
                event: "delete",
                id,
                keyType: auth.type,
                deletedBy: auth.name || "unknown",
            }),
        );

        return c.json({ deleted: true, id });
    },
);

api.get(
    "/:id",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Retrieve media",
        description: "Get a file by its id. Access keeps files from expiring.",
        security: [],
        responses: {
            200: { description: "File content with appropriate Content-Type" },
            404: {
                description: "File not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const id = c.req.param("id");

        try {
            const object = await c.env.MEDIA_BUCKET.get(id);

            if (!object) {
                return c.json({ error: "Not found" }, 404);
            }

            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("Cache-Control", CACHE_CONTROL);
            headers.set("X-Content-Id", id);
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
                id,
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
    "/:id/metadata",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Get file metadata",
        description:
            "Return file metadata (id, content type, size, upload timestamp) as JSON without downloading the file body.",
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
            404: {
                description: "File not found",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const id = c.req.param("id");

        try {
            const object = await c.env.MEDIA_BUCKET.head(id);

            if (!object) {
                return c.json({ error: "Not found" }, 404);
            }

            c.header("Cache-Control", CACHE_CONTROL);
            return c.json({
                id,
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
    "/:id",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Check if media exists",
        description:
            "Check existence and metadata without downloading the file.",
        security: [],
        responses: {
            200: {
                description:
                    "File exists (headers include Content-Type, Content-Length, X-Content-Id)",
            },
            404: { description: "File not found" },
        },
    }),
    async (c) => {
        const id = c.req.param("id");

        try {
            const object = await c.env.MEDIA_BUCKET.head(id);

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
            headers.set("X-Content-Id", id);

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
        allowMethods: ["GET", "POST", "DELETE", "HEAD", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Content-Id", "X-Content-Size"],
    }),
);

app.get("/", (c) => {
    return c.json({
        service: DOMAIN,
        version: "1.0.0",
        endpoints: {
            upload: "POST /upload (requires API key; optional tags — tags publish to public galleries)",
            retrieve: "GET /:id",
            metadata: "GET /:id/metadata",
            listMedia: "GET /media?tag=<tag> (public tag gallery; no auth)",
            deleteMedia:
                "DELETE /media/:id (owner's secret sk_ API key required)",
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
                    "Media storage for Pollinations. Upload images, audio, and video and get back a unique id and URL. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public. Tagging an upload publishes it to that tag's public gallery; the gallery features (tags, listing, delete) are **alpha** — their API may still change.",
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
