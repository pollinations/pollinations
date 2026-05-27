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
const MAX_TAGS = 12;
const MAX_PARENTS = 20;
const MAX_PROMPT_LENGTH = 1000;
const MAX_MODEL_LENGTH = 120;

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    userId?: string | null;
    apiKeyId?: string | null;
    keyId?: string | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
}

type Visibility = "private" | "unlisted" | "public";
type CatalogSource =
    | "upload"
    | "generation"
    | "saved_generation"
    | "edit"
    | "remix";

interface CatalogInput {
    visibility: Visibility;
    source: CatalogSource;
    parents: string[];
    tags: string[];
    prompt?: string;
    model?: string;
}

interface CatalogItem {
    hash: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    visibility: Visibility;
    source: CatalogSource;
    ownerId?: string;
    ownerName?: string;
    apiKeyId?: string;
    appId?: string;
    appName?: string;
    appOwnerUserId?: string;
    parents: string[];
    tags: string[];
    prompt?: string;
    model?: string;
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

function reverseTimestampKey(date = new Date()): string {
    return (9999999999999 - date.getTime()).toString().padStart(13, "0");
}

function safeFacet(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 160);
}

function normalizeMediaHash(value: string): string | null {
    let candidate = value.trim();
    if (!candidate) return null;

    try {
        const url = new URL(candidate);
        candidate = url.pathname.split("/").filter(Boolean).pop() || "";
    } catch {
        candidate = candidate.split("/").filter(Boolean).pop() || candidate;
    }

    const match = candidate.match(/[a-f0-9]{16}/i);
    return match ? match[0].toLowerCase() : null;
}

function normalizeTag(value: string): string | null {
    const tag = safeFacet(value).replace(/-+/g, "-").slice(0, 64);
    return tag || null;
}

function stringFromUnknown(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function fieldValues(
    source: FormData | URLSearchParams | Record<string, unknown>,
    names: string[],
): unknown[] {
    const values: unknown[] = [];
    for (const name of names) {
        if (source instanceof FormData || source instanceof URLSearchParams) {
            values.push(...source.getAll(name));
        } else if (name in source) {
            values.push(source[name]);
        }
    }
    return values;
}

function flattenStringList(values: unknown[]): string[] {
    const strings: string[] = [];

    for (const value of values) {
        if (Array.isArray(value)) {
            strings.push(...flattenStringList(value));
            continue;
        }
        if (value instanceof File) continue;
        if (typeof value !== "string") continue;

        const trimmed = value.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    strings.push(...flattenStringList(parsed));
                    continue;
                }
            } catch {
                // Fall through to comma splitting.
            }
        }

        strings.push(...trimmed.split(",").map((part) => part.trim()));
    }

    return strings.filter(Boolean);
}

function firstString(
    source: FormData | URLSearchParams | Record<string, unknown>,
    names: string[],
): string | null {
    for (const value of fieldValues(source, names)) {
        const stringValue = stringFromUnknown(value);
        if (stringValue) return stringValue;
    }
    return null;
}

function parseVisibility(value: string | null): Visibility {
    if (value === "public" || value === "unlisted" || value === "private") {
        return value;
    }
    return "private";
}

function parseSource(value: string | null, parents: string[]): CatalogSource {
    if (
        value === "upload" ||
        value === "generation" ||
        value === "saved_generation" ||
        value === "edit" ||
        value === "remix"
    ) {
        return value;
    }
    return parents.length > 0 ? "edit" : "upload";
}

function parseCatalogInput(
    source: FormData | URLSearchParams | Record<string, unknown>,
): CatalogInput {
    const parents = Array.from(
        new Set(
            flattenStringList(
                fieldValues(source, [
                    "parent",
                    "parents",
                    "parentIds",
                    "parent_id",
                    "remixOf",
                    "sourceHash",
                ]),
            )
                .map(normalizeMediaHash)
                .filter((hash): hash is string => !!hash),
        ),
    ).slice(0, MAX_PARENTS);

    const tags = Array.from(
        new Set(
            flattenStringList(fieldValues(source, ["tag", "tags"]))
                .map(normalizeTag)
                .filter((tag): tag is string => !!tag),
        ),
    ).slice(0, MAX_TAGS);

    const prompt = firstString(source, ["prompt", "description"])?.slice(
        0,
        MAX_PROMPT_LENGTH,
    );
    const model = firstString(source, ["model"])?.slice(0, MAX_MODEL_LENGTH);
    const visibility = parseVisibility(firstString(source, ["visibility"]));
    const sourceKind = parseSource(
        firstString(source, ["source", "kind"]),
        parents,
    );

    return {
        visibility,
        source: sourceKind,
        parents,
        tags,
        ...(prompt && { prompt }),
        ...(model && { model }),
    };
}

function catalogItemForUpload(params: {
    hash: string;
    contentType: string;
    size: number;
    createdAt: string;
    authResult: AuthResult;
    input: CatalogInput;
}): CatalogItem {
    const apiKeyId = params.authResult.apiKeyId || params.authResult.keyId;
    return {
        hash: params.hash,
        url: mediaUrl(params.hash),
        contentType: params.contentType,
        size: params.size,
        createdAt: params.createdAt,
        visibility: params.input.visibility,
        source: params.input.source,
        ...(params.authResult.userId && { ownerId: params.authResult.userId }),
        ...(params.authResult.name && { ownerName: params.authResult.name }),
        ...(apiKeyId && { apiKeyId }),
        ...(params.authResult.byopClientKeyId && {
            appId: params.authResult.byopClientKeyId,
        }),
        ...(params.authResult.byopClientName && {
            appName: params.authResult.byopClientName,
        }),
        ...(params.authResult.byopClientUserId && {
            appOwnerUserId: params.authResult.byopClientUserId,
        }),
        parents: params.input.parents,
        tags: params.input.tags,
        ...(params.input.prompt && { prompt: params.input.prompt }),
        ...(params.input.model && { model: params.input.model }),
    };
}

async function putCatalogJson(
    bucket: R2Bucket,
    key: string,
    value: unknown,
): Promise<void> {
    await bucket.put(key, JSON.stringify(value), {
        httpMetadata: { contentType: "application/json" },
    });
}

async function writeCatalogEntries(
    bucket: R2Bucket,
    item: CatalogItem,
): Promise<boolean> {
    const timestampKey = reverseTimestampKey(new Date(item.createdAt));
    const indexName = `${timestampKey}-${item.hash}.json`;
    const writes: Promise<void>[] = [
        putCatalogJson(
            bucket,
            `${CATALOG_PREFIX}/items/${item.hash}.json`,
            item,
        ),
    ];

    if (item.ownerId) {
        const ownerId = safeFacet(item.ownerId);
        writes.push(
            putCatalogJson(
                bucket,
                `${CATALOG_PREFIX}/by-owner/${ownerId}/${indexName}`,
                item,
            ),
        );

        if (item.appId) {
            writes.push(
                putCatalogJson(
                    bucket,
                    `${CATALOG_PREFIX}/by-owner-app/${ownerId}/${safeFacet(
                        item.appId,
                    )}/${indexName}`,
                    item,
                ),
            );
        }
    }

    if (item.visibility === "public" && item.appId) {
        writes.push(
            putCatalogJson(
                bucket,
                `${CATALOG_PREFIX}/public-app/${safeFacet(item.appId)}/${indexName}`,
                item,
            ),
        );
    }

    if (item.visibility === "public") {
        for (const tag of item.tags) {
            writes.push(
                putCatalogJson(
                    bucket,
                    `${TAG_PREFIX}/${safeFacet(tag)}/${indexName}`,
                    item,
                ),
            );
        }
    }

    if (item.visibility !== "private") {
        for (const parent of item.parents) {
            writes.push(
                putCatalogJson(
                    bucket,
                    `${LINEAGE_PREFIX}/by-parent/${parent}/${indexName}`,
                    item,
                ),
            );
        }
    }

    const results = await Promise.allSettled(writes);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
        console.error(
            JSON.stringify({
                event: "catalog_write_failed",
                hash: item.hash,
                failures: failures.length,
            }),
        );
    }
    return failures.length === 0;
}

async function readCatalogJson<T>(
    bucket: R2Bucket,
    key: string,
): Promise<T | null> {
    const object = await bucket.get(key);
    if (!object) return null;
    try {
        return JSON.parse(await object.text()) as T;
    } catch {
        return null;
    }
}

function parseListOptions(url: URL): { limit: number; cursor?: string } {
    const requestedLimit = Number.parseInt(
        url.searchParams.get("limit") || "",
        10,
    );
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_LIST_LIMIT)
        : DEFAULT_LIST_LIMIT;
    const cursor = url.searchParams.get("cursor") || undefined;
    return { limit, cursor };
}

async function listCatalogPrefix(
    bucket: R2Bucket,
    prefix: string,
    options: { limit: number; cursor?: string },
    filter?: (item: CatalogItem) => boolean,
): Promise<{ items: CatalogItem[]; nextCursor?: string }> {
    const listed = await bucket.list({
        prefix,
        limit: Math.min(options.limit * 3, 1000),
        cursor: options.cursor,
    });
    const items: CatalogItem[] = [];
    const seen = new Set<string>();

    for (const object of listed.objects) {
        const item = await readCatalogJson<CatalogItem>(bucket, object.key);
        if (!item || seen.has(item.hash)) continue;
        if (filter && !filter(item)) continue;
        seen.add(item.hash);
        items.push(item);
        if (items.length >= options.limit) break;
    }

    return {
        items,
        ...(listed.truncated && listed.cursor
            ? { nextCursor: listed.cursor }
            : {}),
    };
}

async function resolveRequestedAppId(
    appRef: string | null,
): Promise<string | null> {
    if (!appRef) return null;
    if (appRef.startsWith("pk_") || appRef.startsWith("sk_")) {
        const keyInfo = await verifyApiKey(appRef);
        return keyInfo?.apiKeyId || keyInfo?.keyId || null;
    }
    return safeFacet(appRef);
}

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
    cataloged: z.boolean().describe("true when catalog index writes succeeded"),
    visibility: z.enum(["private", "unlisted", "public"]),
    source: z.enum([
        "upload",
        "generation",
        "saved_generation",
        "edit",
        "remix",
    ]),
    parents: z
        .array(z.string())
        .describe("Parent media hashes for remixes/edits"),
    tags: z.array(z.string()).describe("Normalized public discovery tags"),
    appId: z.string().optional().describe("Server-attested BYOP app key id"),
    appName: z
        .string()
        .optional()
        .describe("Server-attested BYOP app key name"),
});

const ErrorSchema = z.object({
    error: z.string(),
});

const CatalogItemSchema = z.object({
    hash: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    createdAt: z.string(),
    visibility: z.enum(["private", "unlisted", "public"]),
    source: z.enum([
        "upload",
        "generation",
        "saved_generation",
        "edit",
        "remix",
    ]),
    ownerId: z.string().optional(),
    ownerName: z.string().optional(),
    apiKeyId: z.string().optional(),
    appId: z.string().optional(),
    appName: z.string().optional(),
    appOwnerUserId: z.string().optional(),
    parents: z.array(z.string()),
    tags: z.array(z.string()),
    prompt: z.string().optional(),
    model: z.string().optional(),
});

const CatalogListSchema = z.object({
    items: z.array(CatalogItemSchema),
    nextCursor: z.string().optional(),
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
        let catalogInput = parseCatalogInput(new URL(c.req.url).searchParams);

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
                catalogInput = parseCatalogInput(formData);
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
                    visibility?: string;
                    source?: string;
                    kind?: string;
                    parent?: string;
                    parents?: string[] | string;
                    parentIds?: string[] | string;
                    remixOf?: string;
                    tags?: string[] | string;
                    tag?: string[] | string;
                    prompt?: string;
                    description?: string;
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

                contentType = body.contentType || "application/octet-stream";
                fileName = body.name;
                catalogInput = parseCatalogInput(body);
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
            const uploadedAt = new Date().toISOString();
            const catalogItem = catalogItemForUpload({
                hash,
                contentType,
                size: fileBuffer.byteLength,
                createdAt: uploadedAt,
                authResult,
                input: catalogInput,
            });

            // Always re-PUT to reset the R2 object timestamp (resets lifecycle TTL).
            await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
                httpMetadata: {
                    contentType,
                    cacheControl: CACHE_CONTROL,
                },
                customMetadata: {
                    uploadedAt,
                    originalName: fileName || "",
                    uploadedBy: authResult.name || "",
                    keyType: authResult.type,
                    ownerId: authResult.userId || "",
                    apiKeyId: authResult.apiKeyId || authResult.keyId || "",
                    appId: authResult.byopClientKeyId || "",
                    visibility: catalogInput.visibility,
                    source: catalogInput.source,
                },
            });
            const cataloged = await writeCatalogEntries(
                c.env.MEDIA_BUCKET,
                catalogItem,
            );

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    ownerId: authResult.userId || null,
                    appId: authResult.byopClientKeyId || null,
                    visibility: catalogInput.visibility,
                    source: catalogInput.source,
                    duplicate: !!existing,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                cataloged,
                visibility: catalogItem.visibility,
                source: catalogItem.source,
                parents: catalogItem.parents,
                tags: catalogItem.tags,
                ...(catalogItem.appId && { appId: catalogItem.appId }),
                ...(catalogItem.appName && { appName: catalogItem.appName }),
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
        summary: "List media for the authenticated user",
        description:
            "Returns cataloged uploads owned by the API key user. Optional query params: app/app_key, tag, limit, cursor.",
        responses: {
            200: {
                description: "Catalog items",
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
        if (!authResult.userId) {
            return c.json({ error: "API key owner is unavailable" }, 400);
        }

        const url = new URL(c.req.url);
        const appRef =
            url.searchParams.get("app_key") ||
            url.searchParams.get("app") ||
            url.searchParams.get("app_id");
        const appId = await resolveRequestedAppId(appRef);
        const tag = normalizeTag(url.searchParams.get("tag") || "");
        const source = firstString(url.searchParams, ["source", "kind"]);
        const ownerId = safeFacet(authResult.userId);
        const prefix = appId
            ? `${CATALOG_PREFIX}/by-owner-app/${ownerId}/${safeFacet(appId)}/`
            : `${CATALOG_PREFIX}/by-owner/${ownerId}/`;
        const result = await listCatalogPrefix(
            c.env.MEDIA_BUCKET,
            prefix,
            parseListOptions(url),
            (item) =>
                (!tag || item.tags.includes(tag)) &&
                (!source || item.source === source),
        );

        return c.json(result);
    },
);

api.get(
    "/gallery",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public app media",
        description:
            "Returns public catalog items for a server-attested app. Pass app=<app key id> or app_key=<publishable key>.",
        responses: {
            200: {
                description: "Catalog items",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
            400: {
                description: "Missing app",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const appRef =
            url.searchParams.get("app_key") ||
            url.searchParams.get("app") ||
            url.searchParams.get("app_id");
        const appId = await resolveRequestedAppId(appRef);
        if (!appId) {
            return c.json(
                {
                    error: "Missing app. Pass app=<app key id> or app_key=<key>.",
                },
                400,
            );
        }

        const tag = normalizeTag(url.searchParams.get("tag") || "");
        const source = firstString(url.searchParams, ["source", "kind"]);
        const result = await listCatalogPrefix(
            c.env.MEDIA_BUCKET,
            `${CATALOG_PREFIX}/public-app/${safeFacet(appId)}/`,
            parseListOptions(url),
            (item) =>
                (!tag || item.tags.includes(tag)) &&
                (!source || item.source === source),
        );

        return c.json(result);
    },
);

api.get(
    "/apps/:app/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public app media by app id",
        description:
            "Returns public catalog items for a server-attested app key id.",
        responses: {
            200: {
                description: "Catalog items",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const appId = safeFacet(c.req.param("app"));
        const tag = normalizeTag(url.searchParams.get("tag") || "");
        const result = await listCatalogPrefix(
            c.env.MEDIA_BUCKET,
            `${CATALOG_PREFIX}/public-app/${appId}/`,
            parseListOptions(url),
            (item) => !tag || item.tags.includes(tag),
        );

        return c.json(result);
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media by tag",
        description: "Returns public catalog items carrying a normalized tag.",
        responses: {
            200: {
                description: "Catalog items",
                content: {
                    "application/json": { schema: resolver(CatalogListSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const tag = normalizeTag(c.req.param("tag") || "");
        if (!tag) return c.json({ items: [] });

        return c.json(
            await listCatalogPrefix(
                c.env.MEDIA_BUCKET,
                `${TAG_PREFIX}/${tag}/`,
                parseListOptions(url),
            ),
        );
    },
);

api.get(
    "/:hash/children",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public/unlisted remixes of a media hash",
        description:
            "Returns cataloged public or unlisted children whose parents include the requested hash.",
        responses: {
            200: {
                description: "Catalog items",
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
        const tag = normalizeTag(url.searchParams.get("tag") || "");
        const appId = safeFacet(url.searchParams.get("app") || "");
        const result = await listCatalogPrefix(
            c.env.MEDIA_BUCKET,
            `${LINEAGE_PREFIX}/by-parent/${hash}/`,
            parseListOptions(url),
            (item) =>
                (!tag || item.tags.includes(tag)) &&
                (!appId || safeFacet(item.appId || "") === appId),
        );

        return c.json(result);
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
            appGallery: "GET /gallery?app=<app-key-id>",
            tagGallery: "GET /tags/:tag",
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
