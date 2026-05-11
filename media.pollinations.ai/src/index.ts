import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";

const DOMAIN = "media.pollinations.ai";
// gen.pollinations.ai proxies /account/* to enter — using the public path
// keeps internal services consistent with the documented SDK/external usage.
const KEY_VERIFY_URL = "https://gen.pollinations.ai/account/key";
// Keep in sync with shared/http/cache-control.ts (IMMUTABLE_CACHE_CONTROL).
// Inlined because this worker has no @shared path mapping. Content-addressed
// storage means the URL → bytes mapping is fixed forever: re-uploading the
// same content reproduces the same URL, and there is no other content the URL
// could ever point to. R2's 30-day lifecycle can delete the underlying object,
// but a fresh upload restores byte-identical content, so `immutable` is safe.
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASH_PATTERN = /^[a-f0-9]{16}$/i;
const DEFAULT_MAX_SIZE = 52428800; // 50 MB

interface Env {
    MEDIA_BUCKET: R2Bucket;
    DB?: D1Database;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
}

interface MediaItem {
    id: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    publicTags?: string[];
    privateTags?: string[];
}

const TAG_PATTERN = /^[a-z0-9\-_]+$/;
const TAG_MAX_LEN = 32;
const MAX_PUBLIC_TAGS = 20;
const MAX_PRIVATE_TAGS = 50;

// Cache DB initialization per worker isolate to avoid repeated DDL calls
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

function normalizeTag(tag: string): string {
    return tag.toLowerCase().trim();
}

function validateTag(tag: string): boolean {
    const normalized = normalizeTag(tag);
    return (
        normalized.length > 0 &&
        normalized.length <= TAG_MAX_LEN &&
        TAG_PATTERN.test(normalized)
    );
}

async function initDb(db: D1Database | undefined): Promise<void> {
    if (!db) return;
    if (dbInitialized) return;
    if (dbInitPromise) {
        await dbInitPromise;
        return;
    }

    dbInitPromise = (async () => {
        const migrations = [
            `CREATE TABLE IF NOT EXISTS media_objects (
                hash TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS public_tags (
                hash TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (hash, tag),
                FOREIGN KEY (hash) REFERENCES media_objects(hash) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS private_tags (
                hash TEXT NOT NULL,
                owner TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (hash, owner, tag),
                FOREIGN KEY (hash) REFERENCES media_objects(hash) ON DELETE CASCADE
            )`,
            `CREATE INDEX IF NOT EXISTS idx_public_tags_tag ON public_tags(tag)`,
            `CREATE INDEX IF NOT EXISTS idx_private_tags_owner_hash ON private_tags(owner, hash)`,
            `CREATE INDEX IF NOT EXISTS idx_media_objects_owner ON media_objects(owner)`,
        ];

        try {
            for (const migration of migrations) {
                await db.exec(migration);
            }
            dbInitialized = true;
        } catch (err) {
            // Reset so the next request can retry rather than permanently failing
            dbInitPromise = null;
            throw err;
        }
    })();

    await dbInitPromise;
}

// URL-safe base64 encoding/decoding for pagination cursors
function encodeCursor(data: object): string {
    return btoa(JSON.stringify(data))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function decodeCursor(cursor: string): { createdAt: string; hash: string } {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (padded.length % 4)) % 4;
    return JSON.parse(atob(padded + "=".repeat(padding)));
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

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
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

const api = new Hono<{ Bindings: Env }>();

api.post(
    "/upload",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Upload media",
        description:
            "Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Files are retained for 30 days; re-uploading resets the timer.",
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
        if (!authResult || !authResult.name) {
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
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
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
            } else {
                fileBuffer = await c.req.arrayBuffer();

                if (fileBuffer.byteLength > maxSize) {
                    return c.json(fileTooLargeError(maxSize), 413);
                }
                if (fileBuffer.byteLength === 0) {
                    return c.json({ error: "Empty file" }, 400);
                }

                contentType = requestContentType || "application/octet-stream";
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

            // Initialize DB and insert into media_objects table
            if (c.env.DB) {
                try {
                    await initDb(c.env.DB);
                    const now = new Date().toISOString();
                    await c.env.DB.prepare(
                        `INSERT OR IGNORE INTO media_objects (hash, owner, content_type, size, created_at)
                         VALUES (?, ?, ?, ?, ?)`,
                    )
                        .bind(
                            hash,
                            authResult.name,
                            contentType,
                            fileBuffer.byteLength,
                            now,
                        )
                        .run();
                } catch (dbError) {
                    console.error("Database error during upload:", dbError);
                    // Don't fail upload if DB write fails - blob is safely in R2
                }
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
            });
        } catch (error) {
            console.error("Upload error:", error);
            return c.json({ error: "Upload failed" }, 500);
        }
    },
);

api.get(
    "/:hash",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Retrieve media",
        description:
            "Get a file by its content hash. No authentication required. Responses are cached immutably.",
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

            return new Response(object.body, { headers });
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

api.get(
    "/me/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List my uploads",
        description:
            "Retrieve a paginated list of your uploaded media with tags. Requires authentication.",
        responses: {
            200: {
                description: "Paginated list of uploads",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.object({
                                items: z.array(
                                    z.object({
                                        id: z.string(),
                                        url: z.string(),
                                        contentType: z.string(),
                                        size: z.number(),
                                        createdAt: z.string(),
                                        publicTags: z
                                            .array(z.string())
                                            .optional(),
                                        privateTags: z
                                            .array(z.string())
                                            .optional(),
                                    }),
                                ),
                                nextCursor: z.string().optional(),
                            }),
                        ),
                    },
                },
            },
            400: {
                description: "Invalid cursor",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "Unauthorized",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const apiKey = extractApiKey(c.req.raw);
        if (!apiKey) {
            return c.json({ error: "API key required" }, 401);
        }
        const authResult = await verifyApiKey(apiKey);
        if (!authResult || !authResult.name) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }

        const limitParam = c.req.query("limit");
        const parsedLimit = Number.parseInt(limitParam || "50", 10);
        const limit =
            Number.isFinite(parsedLimit) && parsedLimit >= 1
                ? Math.min(parsedLimit, 500)
                : 50;
        const cursor = c.req.query("cursor");

        try {
            if (!c.env.DB) {
                return c.json({ items: [] });
            }

            await initDb(c.env.DB);

            let query = `SELECT m.*,
                GROUP_CONCAT(DISTINCT CASE WHEN pt.tag IS NOT NULL THEN pt.tag END) as public_tags,
                GROUP_CONCAT(DISTINCT CASE WHEN prt.tag IS NOT NULL THEN prt.tag END) as private_tags
            FROM media_objects m
            LEFT JOIN public_tags pt ON m.hash = pt.hash
            LEFT JOIN private_tags prt ON m.hash = prt.hash AND prt.owner = ?
            WHERE m.owner = ?`;

            const params: (string | number)[] = [
                authResult.name,
                authResult.name,
            ];

            if (cursor) {
                try {
                    const decoded = decodeCursor(cursor);
                    query += ` AND (m.created_at < ? OR (m.created_at = ? AND m.hash < ?))`;
                    params.push(
                        decoded.createdAt,
                        decoded.createdAt,
                        decoded.hash,
                    );
                } catch {
                    return c.json({ error: "Invalid cursor format" }, 400);
                }
            }

            query += ` GROUP BY m.hash ORDER BY m.created_at DESC, m.hash DESC LIMIT ?`;
            params.push(limit + 1);

            const result = await c.env.DB.prepare(query)
                .bind(...params)
                .all<{
                    hash: string;
                    content_type: string;
                    size: number;
                    created_at: string;
                    public_tags: string | null;
                    private_tags: string | null;
                }>();

            let items: MediaItem[] = [];
            let nextCursor: string | undefined;

            if (result.results && result.results.length > 0) {
                const hasMore = result.results.length > limit;
                const rows = hasMore
                    ? result.results.slice(0, limit)
                    : result.results;

                items = rows.map((row) => ({
                    id: row.hash,
                    url: mediaUrl(row.hash),
                    contentType: row.content_type,
                    size: row.size,
                    createdAt: row.created_at,
                    publicTags: row.public_tags
                        ? row.public_tags.split(",").filter(Boolean)
                        : [],
                    privateTags: row.private_tags
                        ? row.private_tags.split(",").filter(Boolean)
                        : [],
                }));

                if (hasMore) {
                    const lastRow = rows[rows.length - 1];
                    nextCursor = encodeCursor({
                        createdAt: lastRow.created_at,
                        hash: lastRow.hash,
                    });
                }
            }

            return c.json({ items, ...(nextCursor && { nextCursor }) });
        } catch (error) {
            console.error("List media error:", error);
            return c.json({ error: "Failed to list media" }, 500);
        }
    },
);

api.put(
    "/:hash/tags",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Set media tags",
        description:
            "Set public and/or private tags for a media file. Requires authentication and ownership.",
        responses: {
            200: {
                description: "Tags updated",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.object({
                                id: z.string(),
                                public: z.array(z.string()),
                                private: z.array(z.string()),
                            }),
                        ),
                    },
                },
            },
            400: {
                description: "Invalid request",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            401: {
                description: "Unauthorized",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
            403: {
                description: "Not the file owner",
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

        const apiKey = extractApiKey(c.req.raw);
        if (!apiKey) {
            return c.json({ error: "API key required" }, 401);
        }
        const authResult = await verifyApiKey(apiKey);
        if (!authResult || !authResult.name) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }

        let body: { public?: unknown; private?: unknown };
        try {
            body = await c.req.json();
        } catch {
            return c.json({ error: "Invalid JSON body" }, 400);
        }

        if (
            (body.public !== undefined && !Array.isArray(body.public)) ||
            (body.private !== undefined && !Array.isArray(body.private))
        ) {
            return c.json(
                { error: "'public' and 'private' must be arrays" },
                400,
            );
        }

        try {
            const publicTags = [
                ...new Set(
                    ((body.public as string[]) || [])
                        .map(normalizeTag)
                        .filter(validateTag),
                ),
            ];
            const privateTags = [
                ...new Set(
                    ((body.private as string[]) || [])
                        .map(normalizeTag)
                        .filter(validateTag),
                ),
            ];

            if (publicTags.length > MAX_PUBLIC_TAGS) {
                return c.json(
                    { error: `Too many public tags (max ${MAX_PUBLIC_TAGS})` },
                    400,
                );
            }
            if (privateTags.length > MAX_PRIVATE_TAGS) {
                return c.json(
                    {
                        error: `Too many private tags (max ${MAX_PRIVATE_TAGS})`,
                    },
                    400,
                );
            }

            if (!c.env.DB) {
                return c.json({ error: "Database not available" }, 500);
            }

            await initDb(c.env.DB);

            // Verify ownership
            const media = await c.env.DB.prepare(
                "SELECT owner FROM media_objects WHERE hash = ?",
            )
                .bind(hash)
                .first<{ owner: string }>();

            if (!media) {
                return c.json({ error: "Media not found" }, 404);
            }

            if (media.owner !== authResult.name) {
                return c.json({ error: "Not the file owner" }, 403);
            }

            // Replace tags atomically: delete then re-insert
            await c.env.DB.prepare("DELETE FROM public_tags WHERE hash = ?")
                .bind(hash)
                .run();
            await c.env.DB.prepare(
                "DELETE FROM private_tags WHERE hash = ? AND owner = ?",
            )
                .bind(hash, authResult.name)
                .run();

            for (const tag of publicTags) {
                await c.env.DB.prepare(
                    "INSERT OR IGNORE INTO public_tags (hash, tag) VALUES (?, ?)",
                )
                    .bind(hash, tag)
                    .run();
            }

            for (const tag of privateTags) {
                await c.env.DB.prepare(
                    "INSERT OR IGNORE INTO private_tags (hash, owner, tag) VALUES (?, ?, ?)",
                )
                    .bind(hash, authResult.name, tag)
                    .run();
            }

            return c.json({
                id: hash,
                public: publicTags,
                private: privateTags,
            });
        } catch (error) {
            console.error("Tag error:", error);
            return c.json({ error: "Failed to set tags" }, 500);
        }
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Browse by public tag",
        description:
            "Get all media files tagged with a specific public tag. No authentication required.",
        security: [],
        responses: {
            200: {
                description: "Paginated list of media with tag",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.object({
                                tag: z.string(),
                                items: z.array(
                                    z.object({
                                        id: z.string(),
                                        url: z.string(),
                                        contentType: z.string(),
                                        size: z.number(),
                                        createdAt: z.string(),
                                    }),
                                ),
                                nextCursor: z.string().optional(),
                            }),
                        ),
                    },
                },
            },
            400: {
                description: "Invalid tag format",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        let tag = c.req.param("tag");
        tag = normalizeTag(tag);

        if (!validateTag(tag)) {
            return c.json({ error: "Invalid tag format" }, 400);
        }

        const limitParam = c.req.query("limit");
        const parsedLimit = Number.parseInt(limitParam || "50", 10);
        const limit =
            Number.isFinite(parsedLimit) && parsedLimit >= 1
                ? Math.min(parsedLimit, 500)
                : 50;
        const cursor = c.req.query("cursor");

        try {
            if (!c.env.DB) {
                return c.json({ tag, items: [] });
            }

            await initDb(c.env.DB);

            let query = `SELECT m.hash, m.content_type, m.size, m.created_at
            FROM media_objects m
            INNER JOIN public_tags pt ON m.hash = pt.hash
            WHERE pt.tag = ?`;

            const params: (string | number)[] = [tag];

            if (cursor) {
                try {
                    const decoded = decodeCursor(cursor);
                    query += ` AND (m.created_at < ? OR (m.created_at = ? AND m.hash < ?))`;
                    params.push(
                        decoded.createdAt,
                        decoded.createdAt,
                        decoded.hash,
                    );
                } catch {
                    return c.json({ error: "Invalid cursor format" }, 400);
                }
            }

            query += ` ORDER BY m.created_at DESC, m.hash DESC LIMIT ?`;
            params.push(limit + 1);

            const result = await c.env.DB.prepare(query)
                .bind(...params)
                .all<{
                    hash: string;
                    content_type: string;
                    size: number;
                    created_at: string;
                }>();

            let items: Omit<MediaItem, "publicTags" | "privateTags">[] = [];
            let nextCursor: string | undefined;

            if (result.results && result.results.length > 0) {
                const hasMore = result.results.length > limit;
                const rows = hasMore
                    ? result.results.slice(0, limit)
                    : result.results;

                items = rows.map((row) => ({
                    id: row.hash,
                    url: mediaUrl(row.hash),
                    contentType: row.content_type,
                    size: row.size,
                    createdAt: row.created_at,
                }));

                if (hasMore) {
                    const lastRow = rows[rows.length - 1];
                    nextCursor = encodeCursor({
                        createdAt: lastRow.created_at,
                        hash: lastRow.hash,
                    });
                }
            }

            return c.json({ tag, items, ...(nextCursor && { nextCursor }) });
        } catch (error) {
            console.error("Browse tag error:", error);
            return c.json({ error: "Failed to browse tag" }, 500);
        }
    },
);

const app = new Hono<{ Bindings: Env }>();

app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "HEAD", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Content-Hash", "X-Content-Size"],
    }),
);

app.get("/", (c) => {
    return c.json({
        service: DOMAIN,
        version: "1.0.0",
        endpoints: {
            upload: "POST /upload (requires API key)",
            retrieve: "GET /:hash",
            metadata: "GET /:hash/metadata",
            listMyMedia: "GET /me/media (requires API key)",
            setTags: "PUT /:hash/tags (requires API key)",
            browseTag: "GET /tags/:tag",
            docs: "GET /openapi.json",
        },
        limits: {
            maxFileSize: "50MB",
            maxPublicTagsPerFile: MAX_PUBLIC_TAGS,
            maxPrivateTagsPerFile: MAX_PRIVATE_TAGS,
            maxTagLength: TAG_MAX_LEN,
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
                    "Content-addressed media storage. Upload images, audio, and video with deduplication via SHA-256 hashing. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public.",
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
