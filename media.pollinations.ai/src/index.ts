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
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    keyId?: string;
    type: string;
    name: string | null;
    userId?: string | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
}

type Visibility = "private" | "public";
type CatalogSource = "upload" | "generation" | "remix";

type UploadCatalogInput = {
    visibility: Visibility;
    source: CatalogSource;
    remixOf: string | null;
    prompt: string | null;
    model: string | null;
};

type CatalogItem = {
    hash: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    visibility: Visibility;
    source: CatalogSource;
    ownerId?: string;
    ownerName?: string;
    appId?: string;
    appName?: string;
    remixOf?: string;
    prompt?: string;
    model?: string;
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
    visibility: z.enum(["private", "public"]),
    source: z.enum(["upload", "generation", "remix"]),
    ownerId: z.string().optional(),
    ownerName: z.string().optional(),
    appId: z.string().optional(),
    appName: z.string().optional(),
    remixOf: z.string().optional(),
    prompt: z.string().optional(),
    model: z.string().optional(),
});

const CatalogListResponseSchema = z.object({
    items: z.array(CatalogItemSchema),
    cursor: z.string().optional(),
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

function stringField(
    fields: FormData | Record<string, unknown> | URLSearchParams,
    key: string,
): string | null {
    let value: unknown;
    if (fields instanceof FormData) {
        value = fields.get(key);
    } else if (fields instanceof URLSearchParams) {
        value = fields.get(key);
    } else {
        value = fields[key];
    }
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedText(value: string | null, maxLength: number): string | null {
    if (!value) return null;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseVisibility(value: string | null): Visibility {
    return value === "public" ? "public" : "private";
}

function parseSource(value: string | null): CatalogSource {
    if (value === "generation" || value === "remix") return value;
    return "upload";
}

function rawRemixOf(
    fields: FormData | Record<string, unknown> | URLSearchParams,
): string | null {
    return stringField(fields, "remixOf") || stringField(fields, "parent");
}

function hasInvalidRemixOf(
    fields: FormData | Record<string, unknown> | URLSearchParams,
): boolean {
    const remixOf = rawRemixOf(fields);
    return Boolean(remixOf && !HASH_PATTERN.test(remixOf));
}

function parseUploadCatalogInput(
    fields: FormData | Record<string, unknown> | URLSearchParams,
): UploadCatalogInput {
    const remixOf = rawRemixOf(fields);
    return {
        visibility: parseVisibility(stringField(fields, "visibility")),
        source: parseSource(stringField(fields, "source")),
        remixOf: remixOf && HASH_PATTERN.test(remixOf) ? remixOf.toLowerCase() : null,
        prompt: boundedText(stringField(fields, "prompt"), 500),
        model: boundedText(stringField(fields, "model"), 80),
    };
}

function reverseTimestamp(now = Date.now()): string {
    return String(Number.MAX_SAFE_INTEGER - now).padStart(16, "0");
}

function catalogIndexKey(prefix: string, hash: string, now = Date.now()): string {
    return `${prefix}/${reverseTimestamp(now)}-${hash}.json`;
}

function itemKey(hash: string): string {
    return `${CATALOG_PREFIX}/items/${hash}.json`;
}

async function putJson(bucket: R2Bucket, key: string, value: unknown) {
    await bucket.put(key, JSON.stringify(value), {
        httpMetadata: {
            contentType: "application/json",
            cacheControl: "no-store",
        },
    });
}

async function readCatalogItem(
    bucket: R2Bucket,
    key: string,
): Promise<CatalogItem | null> {
    const object = await bucket.get(key);
    if (!object) return null;
    try {
        return (await object.json()) as CatalogItem;
    } catch {
        return null;
    }
}

async function listCatalogItems(
    bucket: R2Bucket,
    prefix: string,
    limit: number,
    cursor?: string | null,
): Promise<{ items: CatalogItem[]; cursor?: string }> {
    const list = await bucket.list({
        prefix,
        limit,
        cursor: cursor || undefined,
    });
    const items = (
        await Promise.all(
            list.objects.map((object) => readCatalogItem(bucket, object.key)),
        )
    ).filter((item): item is CatalogItem => Boolean(item));

    return {
        items,
        ...(list.truncated && list.cursor ? { cursor: list.cursor } : {}),
    };
}

function listLimit(raw: string | null): number {
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(parsed, MAX_LIST_LIMIT);
}

async function resolveAppIdFromQuery(
    app: string | null,
    appKey: string | null,
): Promise<string | null> {
    if (app?.trim()) return app.trim();
    if (!appKey?.trim()) return null;
    const auth = await verifyApiKey(appKey.trim());
    return auth?.keyId || null;
}

async function writeCatalogEntries(
    bucket: R2Bucket,
    auth: AuthResult,
    item: CatalogItem,
) {
    const keys = [itemKey(item.hash)];
    const now = Date.now();

    if (auth.userId) {
        keys.push(
            catalogIndexKey(
                `${CATALOG_PREFIX}/by-owner/${auth.userId}`,
                item.hash,
                now,
            ),
        );
        if (auth.byopClientKeyId) {
            keys.push(
                catalogIndexKey(
                    `${CATALOG_PREFIX}/by-owner-app/${auth.userId}/${auth.byopClientKeyId}`,
                    item.hash,
                    now,
                ),
            );
        }
    }

    if (item.visibility === "public" && auth.byopClientKeyId) {
        keys.push(
            catalogIndexKey(
                `${CATALOG_PREFIX}/public-app/${auth.byopClientKeyId}`,
                item.hash,
                now,
            ),
        );
    }

    if (item.remixOf && item.visibility === "public") {
        keys.push(
            `${LINEAGE_PREFIX}/by-parent/${item.remixOf}/${item.hash}.json`,
            `${LINEAGE_PREFIX}/by-child/${item.hash}/${item.remixOf}.json`,
        );
    }

    await Promise.all(keys.map((key) => putJson(bucket, key, item)));
}

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
        const searchParams = new URL(c.req.url).searchParams;
        let invalidRemixOf = hasInvalidRemixOf(searchParams);
        let catalogInput = parseUploadCatalogInput(searchParams);

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

                invalidRemixOf = hasInvalidRemixOf(formData);
                catalogInput = parseUploadCatalogInput(formData);
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
                    remixOf?: string;
                    parent?: string;
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

                invalidRemixOf = hasInvalidRemixOf(body);
                catalogInput = parseUploadCatalogInput(body);
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

            if (invalidRemixOf) {
                return c.json({ error: "Invalid remixOf hash" }, 400);
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

            const createdAt = new Date().toISOString();
            await writeCatalogEntries(c.env.MEDIA_BUCKET, authResult, {
                hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                createdAt,
                visibility: catalogInput.visibility,
                source: catalogInput.remixOf ? "remix" : catalogInput.source,
                ...(authResult.userId && { ownerId: authResult.userId }),
                ...(authResult.name && { ownerName: authResult.name }),
                ...(authResult.byopClientKeyId && {
                    appId: authResult.byopClientKeyId,
                }),
                ...(authResult.byopClientName && {
                    appName: authResult.byopClientName,
                }),
                ...(catalogInput.remixOf && { remixOf: catalogInput.remixOf }),
                ...(catalogInput.prompt && { prompt: catalogInput.prompt }),
                ...(catalogInput.model && { model: catalogInput.model }),
            });

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
    "/me/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List authenticated user's media",
        responses: {
            200: {
                description: "Media items",
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
        if (!authResult?.userId) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }

        const url = new URL(c.req.url);
        const appId = await resolveAppIdFromQuery(
            url.searchParams.get("app"),
            url.searchParams.get("app_key"),
        );
        const prefix = appId
            ? `${CATALOG_PREFIX}/by-owner-app/${authResult.userId}/${appId}/`
            : `${CATALOG_PREFIX}/by-owner/${authResult.userId}/`;
        return c.json(
            await listCatalogItems(
                c.env.MEDIA_BUCKET,
                prefix,
                listLimit(url.searchParams.get("limit")),
                url.searchParams.get("cursor"),
            ),
        );
    },
);

api.get(
    "/gallery",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public app media",
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
                description: "Missing or invalid app",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const url = new URL(c.req.url);
        const appId = await resolveAppIdFromQuery(
            url.searchParams.get("app"),
            url.searchParams.get("app_key"),
        );
        if (!appId) return c.json({ error: "app or app_key required" }, 400);
        return c.json(
            await listCatalogItems(
                c.env.MEDIA_BUCKET,
                `${CATALOG_PREFIX}/public-app/${appId}/`,
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
    "/:hash/children",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public remixes of a media object",
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
        const hash = c.req.param("hash");
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
            gallery: "GET /gallery?app_key=pk_...",
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
