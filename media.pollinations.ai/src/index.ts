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
const CATALOG_PREFIX = "catalog/v1";
const LINEAGE_PREFIX = "lineage/v1";
const TAG_PREFIX = "tags/v1";
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_TAGS = 20;
const MAX_PARENTS = 8;
const MAX_PROMPT_LENGTH = 500;
const MAX_MODEL_LENGTH = 100;

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    keyId?: string;
    apiKeyId?: string;
    type: string;
    name: string | null;
    userId?: string | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
}

const VISIBILITIES = ["private", "unlisted", "public"] as const;
type Visibility = (typeof VISIBILITIES)[number];
type CatalogSource = "upload" | "generation" | "remix" | "edit" | "saved_generation";

type UploadCatalogInput = {
    visibility: Visibility;
    source: CatalogSource;
    parents: string[];
    relationship: string;
    tags: string[];
    prompt: string | null;
    model: string | null;
};

type UploadFields = {
    visibility?: unknown;
    source?: unknown;
    kind?: unknown;
    parent?: unknown;
    parents?: unknown;
    remixOf?: unknown;
    relationship?: unknown;
    tag?: unknown;
    tags?: unknown;
    prompt?: unknown;
    model?: unknown;
};

type CatalogRecord = {
    entryId: string;
    hash: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    visibility: Visibility;
    source: CatalogSource;
    relationship: string;
    parents: string[];
    tags: string[];
    prompt?: string;
    model?: string;
    ownerId?: string;
    ownerName?: string;
    apiKeyId?: string;
    appId?: string;
    appName?: string;
    appOwnerUserId?: string;
};

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
    cataloged: z
        .boolean()
        .describe("true when the media catalog sidecar indexes were written"),
    visibility: z.enum(VISIBILITIES),
    source: z.string(),
    parents: z.array(z.string()),
    tags: z.array(z.string()),
});

const ErrorSchema = z.object({
    error: z.string(),
});

const CatalogItemSchema = z.object({
    entryId: z.string(),
    hash: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    createdAt: z.string(),
    visibility: z.enum(VISIBILITIES),
    source: z.string(),
    relationship: z.string(),
    parents: z.array(z.string()),
    tags: z.array(z.string()),
    prompt: z.string().optional(),
    model: z.string().optional(),
    ownerId: z.string().optional(),
    apiKeyId: z.string().optional(),
    verifiedApp: z
        .object({
            keyId: z.string(),
            name: z.string().nullable(),
        })
        .nullable(),
});

const CatalogListResponseSchema = z.object({
    items: z.array(CatalogItemSchema),
    nextCursor: z.string().nullable(),
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

function reverseTimestamp(now = Date.now()): string {
    return String(Number.MAX_SAFE_INTEGER - now).padStart(16, "0");
}

function listLimit(raw: string | null): number {
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(parsed, MAX_LIST_LIMIT);
}

function boundedString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function parseVisibility(value: unknown): Visibility {
    if (typeof value !== "string" || !value.trim()) return "private";
    const normalized = value.trim().toLowerCase();
    if ((VISIBILITIES as readonly string[]).includes(normalized)) {
        return normalized as Visibility;
    }
    throw new Error("Invalid visibility");
}

function parseSource(value: unknown, parents: string[]): CatalogSource {
    const source = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (
        source === "upload" ||
        source === "generation" ||
        source === "remix" ||
        source === "edit" ||
        source === "saved_generation"
    ) {
        return source;
    }
    return parents.length ? "remix" : "upload";
}

function parseRelationship(value: unknown): string {
    const relationship =
        typeof value === "string" && value.trim()
            ? value.trim().toLowerCase()
            : "derived_from";
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(relationship)) {
        throw new Error("Invalid relationship");
    }
    return relationship;
}

function parseTags(value: unknown): string[] {
    const tags = flattenStringList(value).map((tag) =>
        tag.trim().toLowerCase(),
    );
    const normalized = [...new Set(tags.filter(Boolean))];
    if (normalized.length > MAX_TAGS) {
        throw new Error("Too many tags");
    }
    for (const tag of normalized) {
        if (!/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(tag)) {
            throw new Error("Invalid tag");
        }
    }
    return normalized;
}

function firstTag(value: unknown): string | null {
    try {
        return parseTags(value)[0] ?? null;
    } catch {
        return null;
    }
}

function parseParents(value: unknown): string[] {
    return [...new Set(flattenStringList(value).map(parseHashReference))].slice(
        0,
        MAX_PARENTS,
    );
}

function parseHashReference(value: string): string {
    const trimmed = value.trim();
    let candidate = trimmed;
    if (trimmed.includes("://")) {
        try {
            candidate =
                new URL(trimmed).pathname.split("/").filter(Boolean).pop() ||
                "";
        } catch {
            throw new Error("Invalid parent hash");
        }
    }
    const hash = candidate.toLowerCase();
    if (!HASH_PATTERN.test(hash)) {
        throw new Error("Invalid parent hash");
    }
    return hash;
}

function flattenStringList(value: unknown): string[] {
    if (value == null) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) => {
        if (Array.isArray(item)) return flattenStringList(item);
        if (typeof item !== "string") return [];
        const trimmed = item.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return flattenStringList(parsed);
            } catch {
                return [];
            }
        }
        return trimmed
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
    });
}

function parseCatalogInput(fields: UploadFields): UploadCatalogInput {
    const parents = parseParents([
        fields.parent,
        fields.parents,
        fields.remixOf,
    ]);
    const source = parseSource(fields.source ?? fields.kind, parents);
    return {
        visibility: parseVisibility(fields.visibility),
        source,
        parents,
        relationship: parseRelationship(fields.relationship),
        tags: parseTags([fields.tag, fields.tags]),
        prompt: boundedString(fields.prompt, MAX_PROMPT_LENGTH),
        model: boundedString(fields.model, MAX_MODEL_LENGTH),
    };
}

function queryFields(params: URLSearchParams): UploadFields {
    return {
        visibility: params.get("visibility"),
        source: params.get("source"),
        kind: params.get("kind"),
        parent: params.getAll("parent"),
        parents: params.getAll("parents"),
        remixOf: params.getAll("remixOf"),
        relationship: params.get("relationship"),
        tag: params.getAll("tag"),
        tags: params.getAll("tags"),
        prompt: params.get("prompt"),
        model: params.get("model"),
    };
}

function formFields(formData: FormData): UploadFields {
    const strings = (key: string) =>
        formData.getAll(key).filter((value): value is string => {
            return typeof value === "string";
        });
    const string = (key: string) => {
        const value = formData.get(key);
        return typeof value === "string" ? value : null;
    };
    return {
        visibility: string("visibility"),
        source: string("source"),
        kind: string("kind"),
        parent: strings("parent"),
        parents: strings("parents"),
        remixOf: strings("remixOf"),
        relationship: string("relationship"),
        tag: strings("tag"),
        tags: strings("tags"),
        prompt: string("prompt"),
        model: string("model"),
    };
}

function mergeFields(base: UploadFields, next: UploadFields): UploadFields {
    const merged = { ...base };
    for (const [key, value] of Object.entries(next)) {
        if (Array.isArray(value) && value.length === 0) continue;
        if (value == null || value === "") continue;
        merged[key as keyof UploadFields] = value;
    }
    return merged;
}

function isClientCatalogError(error: Error): boolean {
    return (
        error.message.startsWith("Invalid ") ||
        error.message.startsWith("Too many ")
    );
}

function keySegment(value: string): string {
    return encodeURIComponent(value);
}

async function putJson(bucket: R2Bucket, key: string, value: unknown) {
    await bucket.put(key, JSON.stringify(value), {
        httpMetadata: {
            contentType: "application/json",
            cacheControl: "no-store",
        },
    });
}

function catalogKey(prefix: string, hash: string, entryId: string): string {
    return `${prefix}/${reverseTimestamp()}-${hash}-${entryId}.json`;
}

async function writeCatalogEntries(
    bucket: R2Bucket,
    record: CatalogRecord,
): Promise<void> {
    const writes = [
        putJson(bucket, `${CATALOG_PREFIX}/items/${record.hash}.json`, record),
    ];

    if (record.ownerId) {
        writes.push(
            putJson(
                bucket,
                catalogKey(
                    `${CATALOG_PREFIX}/by-owner/${keySegment(record.ownerId)}`,
                    record.hash,
                    record.entryId,
                ),
                record,
            ),
        );
        if (record.appId) {
            writes.push(
                putJson(
                    bucket,
                    catalogKey(
                        `${CATALOG_PREFIX}/by-owner-app/${keySegment(record.ownerId)}/${keySegment(record.appId)}`,
                        record.hash,
                        record.entryId,
                    ),
                    record,
                ),
            );
        }
    }

    if (record.visibility === "public" && record.appId) {
        writes.push(
            putJson(
                bucket,
                catalogKey(
                    `${CATALOG_PREFIX}/public-app/${keySegment(record.appId)}`,
                    record.hash,
                    record.entryId,
                ),
                record,
            ),
        );
    }

    if (record.visibility !== "private") {
        for (const parent of record.parents) {
            writes.push(
                putJson(
                    bucket,
                    catalogKey(
                        `${LINEAGE_PREFIX}/by-parent/${parent}`,
                        record.hash,
                        record.entryId,
                    ),
                    record,
                ),
                putJson(
                    bucket,
                    `${LINEAGE_PREFIX}/by-child/${record.hash}/${parent}.json`,
                    record,
                ),
            );
        }
    }

    if (record.visibility === "public") {
        for (const tag of record.tags) {
            writes.push(
                putJson(
                    bucket,
                    catalogKey(
                        `${TAG_PREFIX}/${keySegment(tag)}`,
                        record.hash,
                        record.entryId,
                    ),
                    record,
                ),
            );
        }
    }

    await Promise.all(writes);
}

function catalogItem(
    record: CatalogRecord,
    includePrivateFields = false,
): Record<string, unknown> {
    return {
        entryId: record.entryId,
        hash: record.hash,
        url: record.url,
        contentType: record.contentType,
        size: record.size,
        createdAt: record.createdAt,
        visibility: record.visibility,
        source: record.source,
        relationship: record.relationship,
        parents: record.parents,
        tags: record.tags,
        ...(record.prompt && { prompt: record.prompt }),
        ...(record.model && { model: record.model }),
        verifiedApp: record.appId
            ? {
                  keyId: record.appId,
                  name: record.appName ?? null,
              }
            : null,
        ...(includePrivateFields && record.ownerId
            ? { ownerId: record.ownerId }
            : {}),
        ...(includePrivateFields && record.apiKeyId
            ? { apiKeyId: record.apiKeyId }
            : {}),
    };
}

async function readCatalogItem(
    bucket: R2Bucket,
    key: string,
): Promise<CatalogRecord | null> {
    const object = await bucket.get(key);
    if (!object) return null;
    try {
        return (await object.json()) as CatalogRecord;
    } catch {
        return null;
    }
}

async function listCatalogItems(
    bucket: R2Bucket,
    prefix: string,
    limit: number,
    cursor: string | null,
    includePrivateFields = false,
): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    const list = await bucket.list({
        prefix,
        limit,
        cursor: cursor || undefined,
    });
    const records = await Promise.all(
        list.objects.map((object) => readCatalogItem(bucket, object.key)),
    );
    return {
        items: records
            .filter((record): record is CatalogRecord => Boolean(record))
            .map((record) => catalogItem(record, includePrivateFields)),
        nextCursor: list.truncated && list.cursor ? list.cursor : null,
    };
}

async function resolveAppIdFromQuery(
    app: string | null,
    appKey: string | null,
): Promise<string | null> {
    const direct = app?.trim();
    if (direct) return direct;
    const key = appKey?.trim();
    if (!key) return null;
    const auth = await verifyApiKey(key);
    return auth?.keyId ?? null;
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
        let catalogFields = queryFields(new URL(c.req.url).searchParams);
        let catalogInput = parseCatalogInput(catalogFields);

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

                catalogFields = mergeFields(catalogFields, formFields(formData));
                catalogInput = parseCatalogInput(catalogFields);
                fileBuffer = await file.arrayBuffer();
                contentType = file.type || detectContentType(file.name);
                fileName = file.name;
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
                    visibility?: string;
                    source?: string;
                    kind?: string;
                    parent?: string | string[];
                    parents?: string | string[];
                    remixOf?: string | string[];
                    relationship?: string;
                    tag?: string | string[];
                    tags?: string | string[];
                    prompt?: string;
                    model?: string;
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

                catalogFields = mergeFields(catalogFields, body);
                catalogInput = parseCatalogInput(catalogFields);
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
            const createdAt = new Date().toISOString();
            const ownerId = authResult.userId ?? undefined;
            const apiKeyId = authResult.keyId ?? authResult.apiKeyId;
            const appId = authResult.byopClientKeyId ?? undefined;

            // Always re-PUT to reset the R2 object timestamp (resets lifecycle TTL).
            await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
                httpMetadata: {
                    contentType,
                    cacheControl: CACHE_CONTROL,
                },
                customMetadata: {
                    uploadedAt: createdAt,
                    originalName: fileName || "",
                    uploadedBy: authResult.name || "",
                    keyType: authResult.type,
                    ownerId: ownerId || "",
                    apiKeyId: apiKeyId || "",
                    appId: appId || "",
                    parent: catalogInput.parents[0] || "",
                },
            });

            const record: CatalogRecord = {
                entryId: crypto.randomUUID(),
                hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                createdAt,
                visibility: catalogInput.visibility,
                source: catalogInput.source,
                relationship: catalogInput.relationship,
                parents: catalogInput.parents.filter((parent) => parent !== hash),
                tags: catalogInput.tags,
                ...(catalogInput.prompt && { prompt: catalogInput.prompt }),
                ...(catalogInput.model && { model: catalogInput.model }),
                ...(ownerId && { ownerId }),
                ...(authResult.name && { ownerName: authResult.name }),
                ...(apiKeyId && { apiKeyId }),
                ...(appId && { appId }),
                ...(authResult.byopClientName && {
                    appName: authResult.byopClientName,
                }),
                ...(authResult.byopClientUserId && {
                    appOwnerUserId: authResult.byopClientUserId,
                }),
            };

            let cataloged = false;
            try {
                await writeCatalogEntries(c.env.MEDIA_BUCKET, record);
                cataloged = true;
            } catch (catalogError) {
                console.error("Catalog write error:", catalogError);
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
                    ownerId: ownerId || null,
                    appId: appId || null,
                    visibility: record.visibility,
                    source: record.source,
                    parents: record.parents,
                    tags: record.tags,
                    cataloged,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                cataloged,
                visibility: record.visibility,
                source: record.source,
                parents: record.parents,
                tags: record.tags,
            });
        } catch (error) {
            if (error instanceof Error && isClientCatalogError(error)) {
                return c.json({ error: error.message }, 400);
            }
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
                description: "Cataloged media for the authenticated user",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
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
        const apiKey = extractApiKey(c.req.raw);
        if (!apiKey) return c.json({ error: "API key required" }, 401);
        const authResult = await verifyApiKey(apiKey);
        if (!authResult) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }
        if (!authResult.userId) {
            return c.json({ items: [], nextCursor: null });
        }

        const url = new URL(c.req.url);
        const appId = await resolveAppIdFromQuery(
            url.searchParams.get("app") || url.searchParams.get("app_key_id"),
            url.searchParams.get("app_key"),
        );
        const tag = firstTag(url.searchParams.get("tag"));
        const prefix = appId
            ? `${CATALOG_PREFIX}/by-owner-app/${keySegment(authResult.userId)}/${keySegment(appId)}/`
            : `${CATALOG_PREFIX}/by-owner/${keySegment(authResult.userId)}/`;
        const result = await listCatalogItems(
            c.env.MEDIA_BUCKET,
            prefix,
            listLimit(url.searchParams.get("limit")),
            url.searchParams.get("cursor"),
            true,
        );
        if (tag) {
            result.items = result.items.filter((item) =>
                Array.isArray(item.tags) ? item.tags.includes(tag) : false,
            );
        }
        return c.json(result);
    },
);

api.get(
    "/gallery",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public app or tag media",
        responses: {
            200: {
                description: "Public media items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
            400: {
                description: "Missing or invalid app/tag",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const appId = await resolveAppIdFromQuery(
            url.searchParams.get("app") || url.searchParams.get("app_key_id"),
            url.searchParams.get("app_key"),
        );
        const tag = firstTag(url.searchParams.get("tag"));
        if (!appId && !tag) {
            return c.json({ error: "app, app_key, or tag required" }, 400);
        }
        const prefix = appId
            ? `${CATALOG_PREFIX}/public-app/${keySegment(appId)}/`
            : `${TAG_PREFIX}/${keySegment(tag ?? "")}/`;
        const result = await listCatalogItems(
            c.env.MEDIA_BUCKET,
            prefix,
            listLimit(url.searchParams.get("limit")),
            url.searchParams.get("cursor"),
        );
        if (tag && appId) {
            result.items = result.items.filter((item) =>
                Array.isArray(item.tags) ? item.tags.includes(tag) : false,
            );
        }
        return c.json(result);
    },
);

api.get(
    "/apps/:appKeyId/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media attributed to a verified app",
        description:
            "Returns public uploads stamped with the app key id from the verified /account/key response. App attribution is never trusted from upload params.",
        responses: {
            200: {
                description: "Public app media items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => {
        const appKeyId = c.req.param("appKeyId").trim();
        const url = new URL(c.req.url);
        const result = await listCatalogItems(
            c.env.MEDIA_BUCKET,
            `${CATALOG_PREFIX}/public-app/${keySegment(appKeyId)}/`,
            listLimit(url.searchParams.get("limit")),
            url.searchParams.get("cursor"),
        );
        const tag = firstTag(url.searchParams.get("tag"));
        if (tag) {
            result.items = result.items.filter((item) =>
                Array.isArray(item.tags) ? item.tags.includes(tag) : false,
            );
        }
        return c.json(result);
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media tagged with a tag",
        responses: {
            200: {
                description: "Public tagged media items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => {
        const tag = firstTag(c.req.param("tag"));
        if (!tag) return c.json({ items: [], nextCursor: null });
        const url = new URL(c.req.url);
        return c.json(
            await listCatalogItems(
                c.env.MEDIA_BUCKET,
                `${TAG_PREFIX}/${keySegment(tag)}/`,
                listLimit(url.searchParams.get("limit")),
                url.searchParams.get("cursor"),
            ),
        );
    },
);

api.get(
    "/tags/:tag/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media tagged with a tag",
        responses: {
            200: {
                description: "Public tagged media items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => {
        const tag = firstTag(c.req.param("tag"));
        if (!tag) return c.json({ items: [], nextCursor: null });
        const url = new URL(c.req.url);
        return c.json(
            await listCatalogItems(
                c.env.MEDIA_BUCKET,
                `${TAG_PREFIX}/${keySegment(tag)}/`,
                listLimit(url.searchParams.get("limit")),
                url.searchParams.get("cursor"),
            ),
        );
    },
);

api.get(
    "/:hash/children",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public or unlisted children of a media object",
        responses: {
            200: {
                description: "Child media items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
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
        return c.json(
            await listCatalogItems(
                c.env.MEDIA_BUCKET,
                `${LINEAGE_PREFIX}/by-parent/${hash}/`,
                listLimit(url.searchParams.get("limit")),
                url.searchParams.get("cursor"),
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
            myMedia: "GET /me/media (requires API key)",
            appMedia: "GET /apps/:appKeyId/media",
            gallery: "GET /gallery?app_key=pk_... or /gallery?tag=...",
            tagMedia: "GET /tags/:tag/media",
            children: "GET /:hash/children",
            retrieve: "GET /:hash",
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
