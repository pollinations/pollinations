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
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TAGS = 10;
const MAX_PARENTS = 20;
const MAX_PROMPT_LENGTH = 1000;

interface Env {
    MEDIA_BUCKET: R2Bucket;
    DB: D1Database;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    userId?: string | null;
    apiKeyId?: string | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
}

interface UploadOptions {
    visibility: "public" | "private";
    parentIds: string[];
    tags: string[];
    kind: "upload" | "generation" | "edit" | "saved_generation";
    prompt?: string;
    model?: string;
}

interface CatalogWriteResult {
    recordId: string;
    createdAt: string;
    expiresAt: string;
}

interface CatalogRow {
    id: string;
    url: string;
    hash: string;
    content_type: string;
    size: number;
    expires_at: number | null;
    event_id: string;
    event_created_at: number;
    app_key_id: string | null;
    app_name: string | null;
    attribution_source: string;
    creation_source: string;
    visibility: string;
    prompt: string | null;
    model: string | null;
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

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function truncate(
    value: string | undefined,
    maxLength: number,
): string | undefined {
    if (!value) return undefined;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value !== "string" || value.trim() === "") return [];
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (item): item is string => typeof item === "string",
                );
            }
        } catch {
            return [];
        }
    }
    return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeMediaId(value: string): string | null {
    const trimmed = value.trim();
    if (HASH_PATTERN.test(trimmed)) return trimmed.toLowerCase();
    try {
        const url = new URL(trimmed);
        const [hash] = url.pathname.split("/").filter(Boolean);
        if (hash && HASH_PATTERN.test(hash)) return hash.toLowerCase();
    } catch {
        return null;
    }
    return null;
}

function parseParentIds(value: unknown): string[] {
    return Array.from(
        new Set(
            parseList(value)
                .map(normalizeMediaId)
                .filter((id): id is string => id !== null),
        ),
    ).slice(0, MAX_PARENTS);
}

function parseTags(value: unknown): string[] {
    return Array.from(
        new Set(
            parseList(value)
                .map((tag) =>
                    tag
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9_.:-]/g, "-")
                        .replace(/-+/g, "-")
                        .slice(0, 64),
                )
                .filter(Boolean),
        ),
    ).slice(0, MAX_TAGS);
}

function parseVisibility(value: unknown): "public" | "private" {
    return stringValue(value)?.toLowerCase() === "private"
        ? "private"
        : "public";
}

function parseKind(value: unknown): UploadOptions["kind"] {
    const kind = stringValue(value)?.toLowerCase();
    if (
        kind === "generation" ||
        kind === "edit" ||
        kind === "saved_generation"
    ) {
        return kind;
    }
    return "upload";
}

function uploadOptionsFromValues(values: {
    visibility?: unknown;
    parents?: unknown;
    parentIds?: unknown;
    tags?: unknown;
    kind?: unknown;
    prompt?: unknown;
    model?: unknown;
}): UploadOptions {
    return {
        visibility: parseVisibility(values.visibility),
        parentIds: parseParentIds(values.parentIds ?? values.parents),
        tags: parseTags(values.tags),
        kind: parseKind(values.kind),
        prompt: truncate(stringValue(values.prompt), MAX_PROMPT_LENGTH),
        model: truncate(stringValue(values.model), 100),
    };
}

function uploadOptionsFromUrl(req: Request): UploadOptions {
    const params = new URL(req.url).searchParams;
    return uploadOptionsFromValues({
        visibility: params.get("visibility"),
        parentIds: params.get("parentIds"),
        parents: params.get("parents"),
        tags: params.get("tags"),
        kind: params.get("kind"),
        prompt: params.get("prompt"),
        model: params.get("model"),
    });
}

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
    recordId: z.string().describe("Catalog event id for this upload"),
    visibility: z.enum(["public", "private"]),
    parentIds: z.array(z.string()),
    tags: z.array(z.string()),
    appKeyId: z.string().nullable(),
    attributionSource: z.enum(["byop_key", "none"]),
    createdAt: z.string(),
    expiresAt: z.string(),
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

const CatalogItemSchema = z.object({
    id: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    recordId: z.string(),
    visibility: z.string(),
    creationSource: z.string(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    appKeyId: z.string().nullable(),
    appName: z.string().nullable(),
    attributionSource: z.string(),
    prompt: z.string().nullable(),
    model: z.string().nullable(),
});

const CatalogListSchema = z.object({
    items: z.array(CatalogItemSchema),
    nextCursor: z.string().nullable(),
});

function attributionSource(authResult: AuthResult): "byop_key" | "none" {
    return authResult.byopClientKeyId ? "byop_key" : "none";
}

async function writeCatalogRecord(
    env: Env,
    hash: string,
    contentType: string,
    size: number,
    authResult: AuthResult,
    options: UploadOptions,
): Promise<CatalogWriteResult> {
    const now = Date.now();
    const expiresAt = now + DEFAULT_RETENTION_MS;
    const recordId = crypto.randomUUID();
    const url = mediaUrl(hash);
    const source = attributionSource(authResult);

    const statements: D1PreparedStatement[] = [
        env.DB.prepare(
            `INSERT INTO media_asset
                (id, url, hash, content_type, size, created_at, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                url = excluded.url,
                content_type = excluded.content_type,
                size = excluded.size,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at`,
        ).bind(hash, url, hash, contentType, size, now, now, expiresAt),
        env.DB.prepare(
            `INSERT INTO media_event
                (id, media_id, user_id, api_key_id, app_key_id, app_name,
                 attribution_source, creation_source, visibility, prompt, model, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
            recordId,
            hash,
            authResult.userId ?? null,
            authResult.apiKeyId ?? null,
            authResult.byopClientKeyId ?? null,
            authResult.byopClientName ?? null,
            source,
            options.kind,
            options.visibility,
            options.prompt ?? null,
            options.model ?? null,
            now,
        ),
    ];

    for (const parentId of options.parentIds) {
        if (parentId === hash) continue;
        statements.push(
            env.DB.prepare(
                `INSERT OR IGNORE INTO media_edge
                    (parent_media_id, child_media_id, event_id, relation, created_at)
                 VALUES (?, ?, ?, 'derived_from', ?)`,
            ).bind(parentId, hash, recordId, now),
        );
    }

    for (const tag of options.tags) {
        statements.push(
            env.DB.prepare(
                `INSERT OR IGNORE INTO media_tag
                    (tag, media_id, event_id, source, created_at)
                 VALUES (?, ?, ?, 'user', ?)`,
            ).bind(tag, hash, recordId, now),
        );
    }

    await env.DB.batch(statements);

    return {
        recordId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
    };
}

function catalogItem(row: CatalogRow) {
    return {
        id: row.id,
        url: row.url,
        contentType: row.content_type,
        size: row.size,
        recordId: row.event_id,
        visibility: row.visibility,
        creationSource: row.creation_source,
        createdAt: new Date(row.event_created_at).toISOString(),
        expiresAt: row.expires_at
            ? new Date(row.expires_at).toISOString()
            : null,
        appKeyId: row.app_key_id,
        appName: row.app_name,
        attributionSource: row.attribution_source,
        prompt: row.prompt,
        model: row.model,
    };
}

function parseLimit(value: string | null): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(Math.max(parsed, 1), 100);
}

function parseCursor(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function requireApiKey(request: Request): Promise<AuthResult | Response> {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
        return Response.json(
            {
                error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>",
            },
            { status: 401 },
        );
    }

    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
        return Response.json(
            { error: "Invalid or expired API key" },
            { status: 401 },
        );
    }
    return authResult;
}

function isResponse(value: AuthResult | Response): value is Response {
    return value instanceof Response;
}

async function resolveAppKeyId(appKey: string): Promise<string | null> {
    const appAuth = await verifyApiKey(appKey);
    if (appAuth?.type === "publishable" && appAuth.apiKeyId) {
        return appAuth.apiKeyId;
    }
    return null;
}

type D1Bind = string | number | null;

async function listCatalog(
    db: D1Database,
    sql: string,
    binds: D1Bind[],
    limit: number,
) {
    const { results } = await db
        .prepare(sql)
        .bind(...binds, limit)
        .all<CatalogRow>();
    const items = (results || []).map(catalogItem);
    const nextCursor =
        results && results.length === limit
            ? String(results[results.length - 1].event_created_at)
            : null;
    return { items, nextCursor };
}

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
        const authResult = await requireApiKey(c.req.raw);
        if (isResponse(authResult)) return authResult;

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
        let options = uploadOptionsFromUrl(c.req.raw);

        const requestContentType = c.req.header("content-type") || "";

        try {
            if (requestContentType.includes("multipart/form-data")) {
                const formData = await c.req.formData();
                const file = formData.get("file") as File | null;
                options = uploadOptionsFromValues({
                    visibility: formData.get("visibility"),
                    parentIds: formData.get("parentIds"),
                    parents: formData.get("parents"),
                    tags: formData.get("tags"),
                    kind: formData.get("kind"),
                    prompt: formData.get("prompt"),
                    model: formData.get("model"),
                });

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
                    visibility?: string;
                    parentIds?: string[] | string;
                    parents?: string[] | string;
                    tags?: string[] | string;
                    kind?: string;
                    prompt?: string;
                    model?: string;
                }>();
                options = uploadOptionsFromValues(body);

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
            const catalog = await writeCatalogRecord(
                c.env,
                hash,
                contentType,
                fileBuffer.byteLength,
                authResult,
                options,
            );

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    userId: authResult.userId || "",
                    apiKeyId: authResult.apiKeyId || "",
                    appKeyId: authResult.byopClientKeyId || "",
                    visibility: options.visibility,
                    duplicate: !!existing,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                recordId: catalog.recordId,
                visibility: options.visibility,
                parentIds: options.parentIds,
                tags: options.tags,
                appKeyId: authResult.byopClientKeyId ?? null,
                attributionSource: attributionSource(authResult),
                createdAt: catalog.createdAt,
                expiresAt: catalog.expiresAt,
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
        summary: "List authenticated user's media",
        responses: {
            200: {
                description: "Cataloged media for the current API key owner",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
            401: {
                description: "Missing or invalid API key",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const authResult = await requireApiKey(c.req.raw);
        if (isResponse(authResult)) return authResult;
        if (!authResult.userId) {
            return c.json({ error: "Verified key has no user id" }, 401);
        }

        const url = new URL(c.req.url);
        const limit = parseLimit(url.searchParams.get("limit"));
        const cursor = parseCursor(url.searchParams.get("cursor"));
        const tag = parseTags(url.searchParams.get("tag"))[0];
        const appKey = url.searchParams.get("app_key");
        let appKeyId = url.searchParams.get("app_key_id");
        if (!appKeyId && appKey) {
            appKeyId = await resolveAppKeyId(appKey);
            if (!appKeyId) return c.json({ items: [], nextCursor: null });
        }

        const clauses = ["e.user_id = ?"];
        const binds: D1Bind[] = [authResult.userId];
        if (appKeyId) {
            clauses.push("e.app_key_id = ?");
            binds.push(appKeyId);
        }
        if (cursor) {
            clauses.push("e.created_at < ?");
            binds.push(cursor);
        }

        if (tag) {
            binds.unshift(tag);
            return c.json(
                await listCatalog(
                    c.env.DB,
                    `SELECT
                        a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                        e.id AS event_id, e.created_at AS event_created_at,
                        e.app_key_id, e.app_name, e.attribution_source,
                        e.creation_source, e.visibility, e.prompt, e.model
                     FROM media_tag t
                     JOIN media_event e ON e.id = t.event_id
                     JOIN media_asset a ON a.id = e.media_id
                     WHERE t.tag = ? AND ${clauses.join(" AND ")}
                     ORDER BY e.created_at DESC
                     LIMIT ?`,
                    binds,
                    limit,
                ),
            );
        }

        return c.json(
            await listCatalog(
                c.env.DB,
                `SELECT
                    a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                    e.id AS event_id, e.created_at AS event_created_at,
                    e.app_key_id, e.app_name, e.attribution_source,
                    e.creation_source, e.visibility, e.prompt, e.model
                 FROM media_event e
                 JOIN media_asset a ON a.id = e.media_id
                 WHERE ${clauses.join(" AND ")}
                 ORDER BY e.created_at DESC
                 LIMIT ?`,
                binds,
                limit,
            ),
        );
    },
);

api.get(
    "/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media catalog",
        responses: {
            200: {
                description: "Public media catalog entries",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const limit = parseLimit(url.searchParams.get("limit"));
        const cursor = parseCursor(url.searchParams.get("cursor"));
        const tag = parseTags(url.searchParams.get("tag"))[0];
        const appKey = url.searchParams.get("app_key");
        let appKeyId = url.searchParams.get("app_key_id");
        if (!appKeyId && appKey) {
            appKeyId = await resolveAppKeyId(appKey);
            if (!appKeyId) return c.json({ items: [], nextCursor: null });
        }

        const clauses = ["e.visibility = 'public'"];
        const binds: (string | number)[] = [];
        if (appKeyId) {
            clauses.push("e.app_key_id = ?");
            binds.push(appKeyId);
        }
        if (cursor) {
            clauses.push("e.created_at < ?");
            binds.push(cursor);
        }

        if (tag) {
            binds.unshift(tag);
            return c.json(
                await listCatalog(
                    c.env.DB,
                    `SELECT
                        a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                        e.id AS event_id, e.created_at AS event_created_at,
                        e.app_key_id, e.app_name, e.attribution_source,
                        e.creation_source, e.visibility, e.prompt, e.model
                     FROM media_tag t
                     JOIN media_event e ON e.id = t.event_id
                     JOIN media_asset a ON a.id = e.media_id
                     WHERE t.tag = ? AND ${clauses.join(" AND ")}
                     ORDER BY e.created_at DESC
                     LIMIT ?`,
                    binds,
                    limit,
                ),
            );
        }

        return c.json(
            await listCatalog(
                c.env.DB,
                `SELECT
                    a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                    e.id AS event_id, e.created_at AS event_created_at,
                    e.app_key_id, e.app_name, e.attribution_source,
                    e.creation_source, e.visibility, e.prompt, e.model
                 FROM media_event e
                 JOIN media_asset a ON a.id = e.media_id
                 WHERE ${clauses.join(" AND ")}
                 ORDER BY e.created_at DESC
                 LIMIT ?`,
                binds,
                limit,
            ),
        );
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media by tag",
        responses: {
            200: {
                description: "Public media with the requested tag",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
        },
    }),
    async (c) => {
        const [tag] = parseTags(c.req.param("tag"));
        if (!tag) return c.json({ items: [], nextCursor: null });
        const url = new URL(c.req.url);
        const limit = parseLimit(url.searchParams.get("limit"));
        const cursor = parseCursor(url.searchParams.get("cursor"));
        const cursorClause = cursor ? "AND e.created_at < ?" : "";
        const binds = cursor ? [tag, cursor] : [tag];

        return c.json(
            await listCatalog(
                c.env.DB,
                `SELECT
                    a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                    e.id AS event_id, e.created_at AS event_created_at,
                    e.app_key_id, e.app_name, e.attribution_source,
                    e.creation_source, e.visibility, e.prompt, e.model
                 FROM media_tag t
                 JOIN media_event e ON e.id = t.event_id
                 JOIN media_asset a ON a.id = e.media_id
                 WHERE t.tag = ? AND e.visibility = 'public' ${cursorClause}
                 ORDER BY e.created_at DESC
                 LIMIT ?`,
                binds,
                limit,
            ),
        );
    },
);

api.get(
    "/:hash/children",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public derivative media",
        responses: {
            200: {
                description: "Public children of the requested media hash",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
            400: {
                description: "Invalid hash format",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const hash = c.req.param("hash").toLowerCase();
        if (!HASH_PATTERN.test(hash)) {
            return c.json({ error: "Invalid hash format" }, 400);
        }

        const url = new URL(c.req.url);
        const limit = parseLimit(url.searchParams.get("limit"));
        const cursor = parseCursor(url.searchParams.get("cursor"));
        const cursorClause = cursor ? "AND e.created_at < ?" : "";
        const binds = cursor ? [hash, cursor] : [hash];

        return c.json(
            await listCatalog(
                c.env.DB,
                `SELECT
                    a.id, a.url, a.hash, a.content_type, a.size, a.expires_at,
                    e.id AS event_id, e.created_at AS event_created_at,
                    e.app_key_id, e.app_name, e.attribution_source,
                    e.creation_source, e.visibility, e.prompt, e.model
                 FROM media_edge edge
                 JOIN media_event e ON e.id = edge.event_id
                 JOIN media_asset a ON a.id = edge.child_media_id
                 WHERE edge.parent_media_id = ?
                    AND e.visibility = 'public'
                    ${cursorClause}
                 ORDER BY e.created_at DESC
                 LIMIT ?`,
                binds,
                limit,
            ),
        );
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

const app = new Hono<{ Bindings: Env }>();

app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "HEAD", "OPTIONS"],
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
            me: "GET /me/media (requires API key)",
            gallery: "GET /media?app_key=...&tag=...",
            children: "GET /:hash/children",
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
