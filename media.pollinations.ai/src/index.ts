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
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    // Server-attested identity, added by enter.pollinations.ai/account/key.
    // Both may be null on older tokens or non-BYOP keys; we treat them as
    // anonymous-but-authenticated in that case.
    userId?: string | null;
    appId?: string | null;
    appName?: string | null;
}

const TAG_NAMESPACE = "tags";
const SAFE_FACET_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const USER_TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_USER_TAGS = 8;
const LINEAGE_PREFIX = "lineage/v1/by-parent/";
const CATALOG_ITEM_PREFIX = "catalog/v1/items/";
const CATALOG_OWNER_PREFIX = "catalog/v1/by-owner/";
const CATALOG_APP_PREFIX = "catalog/v1/by-app/";

// R2 keys sort lexicographically. Using (Number.MAX_SAFE_INTEGER - ts) puts
// newest-first under `list({prefix})` so pagination returns recent items
// without a reverse pass.
function revTs(ts: number = Date.now()): string {
    return String(Number.MAX_SAFE_INTEGER - ts).padStart(16, "0");
}

function safeFacet(s: string | null | undefined): string | null {
    if (!s) return null;
    return SAFE_FACET_PATTERN.test(s) ? s : null;
}

function normalizeUserTags(raw: unknown): string[] {
    if (!Array.isArray(raw) && typeof raw !== "string") return [];
    const list = Array.isArray(raw)
        ? raw
        : String(raw)
              .split(",")
              .map((t) => t.trim());
    const out: string[] = [];
    for (const item of list) {
        if (typeof item !== "string") continue;
        const t = item.toLowerCase().trim();
        if (USER_TAG_PATTERN.test(t) && !out.includes(t)) out.push(t);
        if (out.length >= MAX_USER_TAGS) break;
    }
    return out;
}

interface CatalogItem {
    hash: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    owner: string | null;
    app: string | null;
    appName: string | null;
    keyType: string;
    parent: string | null;
    userTags: string[];
    duplicate: boolean;
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
    owner: z
        .string()
        .nullable()
        .describe(
            "Server-attested owner user id. Null if the API key has no user.",
        ),
    app: z
        .string()
        .nullable()
        .describe(
            "Server-attested app id (BYOP). Null if the key was not minted by a registered app. NEVER trusted from request params.",
        ),
    parent: z
        .string()
        .nullable()
        .describe(
            "Parent media hash if this upload was declared as a remix, else null.",
        ),
    userTags: z
        .array(z.string())
        .describe(
            "Caller-supplied tags, lowercased and validated. Untrusted — anyone can write these.",
        ),
});

const CatalogItemSchema = z.object({
    hash: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number(),
    createdAt: z.string(),
    owner: z.string().nullable(),
    app: z.string().nullable(),
    appName: z.string().nullable(),
    parent: z.string().nullable(),
    userTags: z.array(z.string()),
});

const ListResponseSchema = z.object({
    items: z.array(CatalogItemSchema),
    nextCursor: z.string().nullable(),
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
        const url = new URL(c.req.url);
        // Provenance inputs can arrive either as query params or as form/JSON
        // fields. We read query params unconditionally and let body fields
        // override below.
        let parentInput = url.searchParams.get("parent") || "";
        let userTagsInput: unknown = url.searchParams.getAll("tag");
        if (Array.isArray(userTagsInput) && userTagsInput.length === 0) {
            userTagsInput = url.searchParams.get("tags");
        }

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
                const parentField = formData.get("parent");
                if (typeof parentField === "string") parentInput = parentField;
                const tagsField = formData.getAll("tag");
                if (tagsField.length > 0) userTagsInput = tagsField as string[];
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
                    parent?: string;
                    tags?: string[] | string;
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
                if (typeof body.parent === "string") parentInput = body.parent;
                if (body.tags !== undefined) userTagsInput = body.tags;
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

            // Server-attested provenance. We deliberately never read `app` or
            // `owner` from request params — only from the verified /account/key
            // response. Free-form user tags travel in a separate namespace.
            const owner = safeFacet(authResult.userId ?? null);
            const app = safeFacet(authResult.appId ?? null);
            const appName = authResult.appName ?? null;
            const parent =
                parentInput && HASH_PATTERN.test(parentInput)
                    ? parentInput.toLowerCase()
                    : null;
            const userTags = normalizeUserTags(userTagsInput);
            const createdAt = new Date().toISOString();
            const rev = revTs();

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
                    owner: owner || "",
                    app: app || "",
                    parent: parent || "",
                },
            });

            const item: CatalogItem = {
                hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                createdAt,
                owner,
                app,
                appName,
                keyType: authResult.type,
                parent,
                userTags,
                duplicate: !!existing,
            };
            const itemJson = JSON.stringify(item);

            // Index writes are best-effort: failures here must not break the
            // upload. We log but always return success once the blob is in R2.
            // Order: item-by-hash, owner index, app index, lineage. We swallow
            // individual rejections so partial failure leaves a valid blob and
            // partial index — which the read endpoints already tolerate.
            const writes: Promise<unknown>[] = [
                c.env.MEDIA_BUCKET.put(
                    `${CATALOG_ITEM_PREFIX}${hash}.json`,
                    itemJson,
                    { httpMetadata: { contentType: "application/json" } },
                ),
            ];
            if (owner) {
                writes.push(
                    c.env.MEDIA_BUCKET.put(
                        `${CATALOG_OWNER_PREFIX}${owner}/${rev}-${hash}.json`,
                        itemJson,
                        {
                            httpMetadata: { contentType: "application/json" },
                        },
                    ),
                );
            }
            if (app) {
                writes.push(
                    c.env.MEDIA_BUCKET.put(
                        `${CATALOG_APP_PREFIX}${app}/${rev}-${hash}.json`,
                        itemJson,
                        {
                            httpMetadata: { contentType: "application/json" },
                        },
                    ),
                );
            }
            if (parent) {
                writes.push(
                    c.env.MEDIA_BUCKET.put(
                        `${LINEAGE_PREFIX}${parent}/${rev}-${hash}.json`,
                        itemJson,
                        {
                            httpMetadata: { contentType: "application/json" },
                        },
                    ),
                );
            }
            for (const tag of userTags) {
                writes.push(
                    c.env.MEDIA_BUCKET.put(
                        `${TAG_NAMESPACE}/v1/${tag}/${rev}-${hash}.json`,
                        itemJson,
                        {
                            httpMetadata: { contentType: "application/json" },
                        },
                    ),
                );
            }
            await Promise.allSettled(writes);

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    owner,
                    app,
                    parent,
                    userTags,
                    duplicate: !!existing,
                }),
            );

            return c.json({
                id: hash,
                url: item.url,
                contentType: item.contentType,
                size: item.size,
                duplicate: item.duplicate,
                owner: item.owner,
                app: item.app,
                parent: item.parent,
                userTags: item.userTags,
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

async function readCatalogItems(
    bucket: R2Bucket,
    prefix: string,
    limit: number,
    cursor: string | undefined,
): Promise<{ items: CatalogItem[]; nextCursor: string | null }> {
    const listResult = await bucket.list({
        prefix,
        limit,
        cursor: cursor || undefined,
    });
    const items: CatalogItem[] = [];
    // Hydrate each listing entry to its full JSON record. Index entries that
    // fail to parse or 404 mid-list are dropped — they may have been pruned
    // by lifecycle or a future tombstone path.
    const reads = await Promise.allSettled(
        listResult.objects.map(async (obj) => {
            const got = await bucket.get(obj.key);
            if (!got) return null;
            try {
                return (await got.json()) as CatalogItem;
            } catch {
                return null;
            }
        }),
    );
    for (const r of reads) {
        if (r.status === "fulfilled" && r.value) items.push(r.value);
    }
    const nextCursor =
        listResult.truncated && "cursor" in listResult
            ? (listResult.cursor as string | undefined) || null
            : null;
    return { items, nextCursor };
}

function clampLimit(raw: string | null): number {
    const n = parseInt(raw || "50", 10);
    if (Number.isNaN(n) || n <= 0) return 50;
    return Math.min(n, 200);
}

api.get(
    "/:hash/children",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List remixes derived from this hash",
        description:
            "Returns public remix children declared via `parent=<hash>` on upload. Newest first. No auth required.",
        responses: {
            200: {
                description: "List of children",
                content: {
                    "application/json": {
                        schema: resolver(ListResponseSchema),
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
        const limit = clampLimit(url.searchParams.get("limit"));
        const cursor = url.searchParams.get("cursor") || undefined;
        const result = await readCatalogItems(
            c.env.MEDIA_BUCKET,
            `${LINEAGE_PREFIX}${hash.toLowerCase()}/`,
            limit,
            cursor,
        );
        return c.json(result);
    },
);

api.get(
    "/me/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List uploads by the authenticated user",
        description:
            "Returns the caller's own uploads, newest first. The `app` query param optionally filters to a single app id (must match the verified app id of the calling key).",
        responses: {
            200: {
                description: "List of items",
                content: {
                    "application/json": {
                        schema: resolver(ListResponseSchema),
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
        if (!apiKey) {
            return c.json({ error: "API key required" }, 401);
        }
        const authResult = await verifyApiKey(apiKey);
        if (!authResult) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }
        const owner = safeFacet(authResult.userId ?? null);
        if (!owner) {
            // Key is valid but has no resolvable user id (e.g. legacy key
            // pre-dating /account/key exposing userId). Honest empty result.
            return c.json({ items: [], nextCursor: null });
        }
        const url = new URL(c.req.url);
        const limit = clampLimit(url.searchParams.get("limit"));
        const cursor = url.searchParams.get("cursor") || undefined;
        const appFilter = safeFacet(url.searchParams.get("app"));
        const result = await readCatalogItems(
            c.env.MEDIA_BUCKET,
            `${CATALOG_OWNER_PREFIX}${owner}/`,
            limit,
            cursor,
        );
        if (appFilter) {
            result.items = result.items.filter((i) => i.app === appFilter);
        }
        return c.json(result);
    },
);

api.get(
    "/apps/:app/media",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public uploads attributed to an app",
        description:
            "Returns uploads where the verified app id matches. Newest first. No auth required; `app` is server-attested at upload time so this listing is impersonation-resistant.",
        responses: {
            200: {
                description: "List of items",
                content: {
                    "application/json": {
                        schema: resolver(ListResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid app id",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const app = safeFacet(c.req.param("app"));
        if (!app) {
            return c.json({ error: "Invalid app id" }, 400);
        }
        const url = new URL(c.req.url);
        const limit = clampLimit(url.searchParams.get("limit"));
        const cursor = url.searchParams.get("cursor") || undefined;
        const result = await readCatalogItems(
            c.env.MEDIA_BUCKET,
            `${CATALOG_APP_PREFIX}${app}/`,
            limit,
            cursor,
        );
        return c.json(result);
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
        version: "1.1.0",
        endpoints: {
            upload: "POST /upload (requires API key)",
            retrieve: "GET /:hash",
            children: "GET /:hash/children",
            myMedia: "GET /me/media (requires API key)",
            appMedia: "GET /apps/:app/media",
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
