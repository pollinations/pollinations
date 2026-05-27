import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";
import {
    type CatalogEntry,
    type CatalogFields,
    catalogFieldsFromFormData,
    catalogFieldsFromObject,
    catalogFieldsFromSearchParams,
    catalogItem,
    catalogPrefix,
    createCatalogEntry,
    listCatalogEntries,
    normalizeCatalogUrl,
    parseListLimit,
    resolveCatalogAppFacet,
    safeFacet,
    writeCatalogEntry,
} from "./catalog";

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
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    userId?: string;
    apiKeyId?: string;
    keyId?: string;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
    byopClientUserId?: string | null;
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

function authCatalogFields(authResult: AuthResult) {
    return {
        ownerUserId: authResult.userId,
        ownerName: authResult.name,
        apiKeyId: authResult.apiKeyId || authResult.keyId,
        keyType: authResult.type,
        appKeyId: authResult.byopClientKeyId ?? null,
        appName: authResult.byopClientName ?? null,
        appOwnerUserId: authResult.byopClientUserId ?? null,
    };
}

async function requireApiKey(req: Request) {
    const apiKey = extractApiKey(req);
    if (!apiKey) return null;
    return verifyApiKey(apiKey);
}

function catalogListResponse(
    entries: CatalogEntry[],
    limit: number,
    includePrivateFields = false,
) {
    const media = entries.map((entry) =>
        catalogItem(entry, includePrivateFields),
    );
    return { media, count: media.length, limit };
}

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
    entryId: z.string().describe("Catalog entry ID"),
    visibility: z.enum(["private", "public", "unlisted"]),
    tags: z.array(z.string()),
    appKeyId: z.string().nullable().optional(),
    appName: z.string().nullable().optional(),
});

const ErrorSchema = z.object({
    error: z.string(),
});

const CatalogItemSchema = z.object({
    entryId: z.string(),
    url: z.string(),
    hash: z.string().optional(),
    contentType: z.string().optional(),
    size: z.number().int().optional(),
    createdAt: z.string(),
    visibility: z.enum(["private", "public", "unlisted"]),
    tags: z.array(z.string()),
    prompt: z.string().optional(),
    model: z.string().optional(),
    appKeyId: z.string().optional(),
    appName: z.string().optional(),
});

const CatalogListResponseSchema = z.object({
    media: z.array(CatalogItemSchema),
    count: z.number().int(),
    limit: z.number().int(),
});

const CatalogCreateResponseSchema = CatalogItemSchema.extend({
    cataloged: z.boolean(),
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
        let catalogFields: CatalogFields = catalogFieldsFromSearchParams(
            new URL(c.req.url).searchParams,
        );

        const requestContentType = c.req.header("content-type") || "";

        try {
            if (requestContentType.includes("multipart/form-data")) {
                const formData = await c.req.formData();
                catalogFields = catalogFieldsFromFormData(formData);
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
                    tag?: string | string[];
                    tags?: string | string[];
                    visibility?: string;
                    prompt?: string;
                    model?: string;
                }>();
                catalogFields = catalogFieldsFromObject(
                    body as Record<string, unknown>,
                );

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

            const entry = createCatalogEntry({
                url: mediaUrl(hash),
                hash,
                contentType,
                size: fileBuffer.byteLength,
                fields: catalogFields,
                ...authCatalogFields(authResult),
            });
            await writeCatalogEntry(c.env.MEDIA_BUCKET, entry);

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    userId: authResult.userId,
                    appKeyId: authResult.byopClientKeyId,
                    duplicate: !!existing,
                    entryId: entry.entryId,
                    visibility: entry.visibility,
                    tags: entry.tags,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                entryId: entry.entryId,
                visibility: entry.visibility,
                tags: entry.tags,
                appKeyId: entry.appKeyId,
                appName: entry.appName,
            });
        } catch (error) {
            console.error("Upload error:", error);
            return c.json({ error: "Upload failed" }, 500);
        }
    },
);

api.post(
    "/catalog",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Catalog existing media",
        description:
            "Create a tag-indexed catalog entry for an existing Pollinations media URL without uploading bytes again. Relationships can be modeled as ordinary tags such as `parent:<hash>`.",
        responses: {
            200: {
                description: "Catalog entry created",
                content: {
                    "application/json": {
                        schema: resolver(CatalogCreateResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid URL or catalog fields",
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
        },
    }),
    async (c) => {
        const authResult = await requireApiKey(c.req.raw);
        if (!authResult) {
            return c.json({ error: "Missing or invalid API key" }, 401);
        }

        try {
            const requestContentType = c.req.header("content-type") || "";
            let body: Record<string, unknown>;
            let fields: CatalogFields;

            if (requestContentType.includes("multipart/form-data")) {
                const formData = await c.req.formData();
                body = Object.fromEntries(formData.entries());
                fields = catalogFieldsFromFormData(formData);
            } else {
                body = (await c.req.json()) as Record<string, unknown>;
                fields = catalogFieldsFromObject(body);
            }

            const normalized = normalizeCatalogUrl(body.url);
            const entry = createCatalogEntry({
                ...normalized,
                contentType: fields.contentType,
                size: fields.size,
                fields,
                ...authCatalogFields(authResult),
            });
            await writeCatalogEntry(c.env.MEDIA_BUCKET, entry);

            return c.json({
                cataloged: true,
                ...catalogItem(entry, true),
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Catalog failed";
            return c.json({ error: message }, 400);
        }
    },
);

api.get(
    "/me/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List my media",
        description:
            "List catalog entries created by the authenticated user, including private entries.",
        responses: {
            200: {
                description: "Catalog entries",
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
        const authResult = await requireApiKey(c.req.raw);
        if (!authResult) {
            return c.json({ error: "Missing or invalid API key" }, 401);
        }

        const limit = parseListLimit(c.req.query("limit") ?? null);
        const owner = safeFacet(authResult.userId || authResult.name);
        const entries = await listCatalogEntries(
            c.env.MEDIA_BUCKET,
            catalogPrefix("owner", owner),
            limit,
        );
        return c.json(catalogListResponse(entries, limit, true));
    },
);

api.get(
    "/gallery",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media",
        description:
            "List public catalog entries. Filter with `tag`, `app`, or `app_key`.",
        security: [],
        responses: {
            200: {
                description: "Public catalog entries",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => {
        const limit = parseListLimit(c.req.query("limit") ?? null);
        const tag = c.req.query("tag");
        const appRef = c.req.query("app_key") || c.req.query("app");
        const appFacet = await resolveCatalogAppFacet(
            appRef ?? null,
            verifyApiKey,
        );
        if (appRef && !appFacet) {
            return c.json(catalogListResponse([], limit));
        }
        const prefix = tag
            ? catalogPrefix("tag", tag)
            : appFacet
              ? catalogPrefix("app", appFacet)
              : catalogPrefix("public");
        const entries = (
            await listCatalogEntries(c.env.MEDIA_BUCKET, prefix, limit)
        ).filter((entry) => entry.visibility === "public");
        return c.json(catalogListResponse(entries, limit));
    },
);

api.get("/apps/:app/media", async (c) => {
    const limit = parseListLimit(c.req.query("limit") ?? null);
    const appFacet = await resolveCatalogAppFacet(
        c.req.param("app"),
        verifyApiKey,
    );
    if (!appFacet) return c.json({ error: "Invalid app" }, 400);
    const entries = (
        await listCatalogEntries(
            c.env.MEDIA_BUCKET,
            catalogPrefix("app", appFacet),
            limit,
        )
    ).filter((entry) => entry.visibility === "public");
    return c.json(catalogListResponse(entries, limit));
});

api.get("/tags/:tag", async (c) => {
    const limit = parseListLimit(c.req.query("limit") ?? null);
    const entries = (
        await listCatalogEntries(
            c.env.MEDIA_BUCKET,
            catalogPrefix("tag", c.req.param("tag")),
            limit,
        )
    ).filter((entry) => entry.visibility === "public");
    return c.json(catalogListResponse(entries, limit));
});

api.get("/tags/:tag/media", async (c) => {
    const limit = parseListLimit(c.req.query("limit") ?? null);
    const entries = (
        await listCatalogEntries(
            c.env.MEDIA_BUCKET,
            catalogPrefix("tag", c.req.param("tag")),
            limit,
        )
    ).filter((entry) => entry.visibility === "public");
    return c.json(catalogListResponse(entries, limit));
});

api.get("/:hash/catalog", async (c) => {
    const hash = c.req.param("hash");
    if (!HASH_PATTERN.test(hash)) {
        return c.json({ error: "Invalid hash format" }, 400);
    }
    const limit = parseListLimit(c.req.query("limit") ?? null);
    const entries = (
        await listCatalogEntries(
            c.env.MEDIA_BUCKET,
            catalogPrefix("hash", hash),
            limit,
        )
    ).filter((entry) => entry.visibility === "public");
    return c.json(catalogListResponse(entries, limit));
});

api.get(
    "/:hash",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Retrieve media",
        description:
            "Get a file by its content hash. No authentication required. Responses are cached immutably.",
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
            catalog: "POST /catalog (requires API key)",
            myMedia: "GET /me/media (requires API key)",
            gallery: "GET /gallery",
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
