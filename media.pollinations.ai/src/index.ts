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

// Catalog primitives. The catalog is opt-in: an upload only appears in any
// listing if the uploader explicitly tagged it. The owner index is the only
// exception — it lists what you uploaded with your key, since that's just
// "show me what I sent", not a publish action.
//
// Hash-is-capability: GET /:hash is public, period. Anyone who knows the
// hash can fetch the bytes. There is no "private" mode and the catalog does
// not pretend otherwise. The catalog only controls discoverability.
const OWNER_PREFIX = "catalog/v1/by-owner/";
const ITEM_PREFIX = "catalog/v1/items/";
const TAG_PREFIX = "tags/v1/";
const TAG_BY_APP_PREFIX = "tags/v1/by-app/";
const MAX_TAGS = 8;
const MAX_PROMPT_LEN = 2000;
const MAX_MODEL_LEN = 128;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:+-]{0,127}$/i;
const FACET_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
    userId?: string | null;
    keyId?: string | null;
    byopClientKeyId?: string | null;
    byopClientName?: string | null;
}

interface CatalogEntry {
    id: string;
    hash: string;
    url: string;
    contentType: string;
    size: number;
    owner: string | null;
    app: string | null;
    appName: string | null;
    tags: string[];
    prompt: string | null;
    model: string | null;
    createdAt: string;
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

// ── Catalog helpers ─────────────────────────────────────────────────────────

function safeFacet(value: string | null | undefined): string | null {
    if (!value) return null;
    return FACET_PATTERN.test(value) ? value : null;
}

function asString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
}

function clampString(v: unknown, max: number): string | null {
    const s = asString(v);
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
}

function collectFieldValues(
    fields: FormData | URLSearchParams | Record<string, unknown>,
    keys: string[],
): string[] {
    const out: string[] = [];
    if (fields instanceof FormData || fields instanceof URLSearchParams) {
        for (const key of keys)
            for (const v of fields.getAll(key))
                if (typeof v === "string") out.push(v);
        return out;
    }
    for (const key of keys) {
        const v = (fields as Record<string, unknown>)[key];
        if (Array.isArray(v)) {
            for (const e of v) {
                if (typeof e === "string") out.push(e);
            }
        } else if (typeof v === "string") {
            out.push(v);
        }
    }
    return out;
}

function stringField(
    fields: FormData | URLSearchParams | Record<string, unknown>,
    key: string,
): string | null {
    if (fields instanceof FormData || fields instanceof URLSearchParams)
        return asString(fields.get(key));
    return asString((fields as Record<string, unknown>)[key]);
}

function normalizeTags(
    fields: FormData | URLSearchParams | Record<string, unknown>,
): string[] {
    const out = new Set<string>();
    for (const raw of collectFieldValues(fields, ["tag", "tags"])) {
        for (const part of raw.split(",")) {
            const t = part.trim().toLowerCase();
            if (TAG_PATTERN.test(t)) out.add(t);
            if (out.size >= MAX_TAGS) return [...out];
        }
    }
    return [...out];
}

function revToken(ms: number): string {
    // (2^53 - 1).toString() is 16 chars; pad so R2 lex sort yields newest-first.
    return (Number.MAX_SAFE_INTEGER - ms).toString().padStart(16, "0");
}

function newEntryId(now: number): string {
    const rand = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    return `${now.toString(36)}-${rand}`;
}

function clampLimit(raw: string | null): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}

async function writeCatalogEntry(
    bucket: R2Bucket,
    entry: CatalogEntry,
): Promise<void> {
    const body = JSON.stringify(entry);
    const opts = { httpMetadata: { contentType: "application/json" } };
    const rev = revToken(Date.parse(entry.createdAt));
    const writes: Promise<unknown>[] = [
        bucket.put(`${ITEM_PREFIX}${entry.hash}/${entry.id}.json`, body, opts),
    ];
    if (entry.owner) {
        writes.push(
            bucket.put(
                `${OWNER_PREFIX}${entry.owner}/${rev}-${entry.id}.json`,
                body,
                opts,
            ),
        );
    }
    // Per-tag indexes are the only "public" listing surface. An upload only
    // appears in any tag listing if the uploader explicitly tagged it.
    for (const tag of entry.tags) {
        writes.push(
            bucket.put(
                `${TAG_PREFIX}${tag}/${rev}-${entry.id}.json`,
                body,
                opts,
            ),
        );
        if (entry.app) {
            writes.push(
                bucket.put(
                    `${TAG_BY_APP_PREFIX}${entry.app}/${tag}/${rev}-${entry.id}.json`,
                    body,
                    opts,
                ),
            );
        }
    }
    // Best-effort: an index write failure doesn't fail the upload.
    await Promise.allSettled(writes);
}

async function listCatalog(
    bucket: R2Bucket,
    prefix: string,
    limit: number,
    cursor: string | null,
): Promise<{ items: CatalogEntry[]; cursor: string | null }> {
    const listed = await bucket.list({
        prefix,
        limit,
        ...(cursor ? { cursor } : {}),
    });
    const hydrated = await Promise.all(
        listed.objects.map((o) => bucket.get(o.key)),
    );
    const items: CatalogEntry[] = [];
    for (const obj of hydrated) {
        if (!obj) continue;
        try {
            items.push((await obj.json()) as CatalogEntry);
        } catch {
            // skip malformed
        }
    }
    return {
        items,
        cursor: listed.truncated ? (listed.cursor ?? null) : null,
    };
}

const UploadResponseSchema = z.object({
    id: z.string().describe("16-char hex content hash"),
    url: z.string().describe("Public retrieval URL"),
    contentType: z.string(),
    size: z.number().int().describe("File size in bytes"),
    duplicate: z.boolean().describe("true if file already existed"),
    tags: z.array(z.string()).optional().describe("Tags echoed back, when any"),
});

const CatalogEntrySchema = z.object({
    id: z.string(),
    hash: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    owner: z.string().nullable(),
    app: z.string().nullable(),
    appName: z.string().nullable(),
    tags: z.array(z.string()),
    prompt: z.string().nullable(),
    model: z.string().nullable(),
    createdAt: z.string(),
});

const CatalogListResponseSchema = z.object({
    items: z.array(CatalogEntrySchema),
    cursor: z.string().nullable(),
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

        // Catalog input sources: query params first (always parseable), then
        // overridden by body fields when a structured body is present. None of
        // this affects ownership — owner/app come from the verified key only.
        const urlParams = new URL(c.req.url).searchParams;
        let tags = normalizeTags(urlParams);
        let prompt = clampString(
            stringField(urlParams, "prompt"),
            MAX_PROMPT_LEN,
        );
        let model = clampString(stringField(urlParams, "model"), MAX_MODEL_LEN);

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
                const formTags = normalizeTags(formData);
                if (formTags.length) tags = formTags;
                prompt =
                    clampString(
                        stringField(formData, "prompt"),
                        MAX_PROMPT_LEN,
                    ) ?? prompt;
                model =
                    clampString(
                        stringField(formData, "model"),
                        MAX_MODEL_LEN,
                    ) ?? model;
            } else if (requestContentType.includes("application/json")) {
                const body = await c.req.json<{
                    data: string;
                    contentType?: string;
                    name?: string;
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

                contentType = body.contentType || "application/octet-stream";
                fileName = body.name;
                const bodyTags = normalizeTags(
                    body as unknown as Record<string, unknown>,
                );
                if (bodyTags.length) tags = bodyTags;
                prompt = clampString(body.prompt, MAX_PROMPT_LEN) ?? prompt;
                model = clampString(body.model, MAX_MODEL_LEN) ?? model;
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

            console.log(
                JSON.stringify({
                    event: "upload",
                    hash,
                    size: fileBuffer.byteLength,
                    contentType,
                    keyType: authResult.type,
                    uploadedBy: authResult.name || "unknown",
                    duplicate: !!existing,
                    tags: tags.length,
                }),
            );

            // Owner and app come from the verified key — never request params.
            const now = Date.now();
            const owner = safeFacet(authResult.userId);
            const app = safeFacet(authResult.byopClientKeyId);
            const entry: CatalogEntry = {
                id: newEntryId(now),
                hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                owner,
                app,
                appName: app ? (authResult.byopClientName ?? null) : null,
                tags,
                prompt,
                model,
                createdAt: new Date(now).toISOString(),
            };
            await writeCatalogEntry(c.env.MEDIA_BUCKET, entry);

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                ...(tags.length ? { tags } : {}),
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
        summary: "List media you uploaded",
        description:
            "Lists media uploaded with the calling key, newest first. Optionally filter by `tag` (exact, repeat for multiple — items matching any tag are returned by independent calls to a single tag). Use `?app=<keyId>` to limit to one app's uploads. Returns full metadata including server-attested owner and app — this endpoint reveals identity because it's *your* inbox, not a public listing.",
        responses: {
            200: {
                description: "Catalog items",
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
        const owner = safeFacet(authResult?.userId);
        if (!owner) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }
        const url = new URL(c.req.url);
        return c.json(
            await listCatalog(
                c.env.MEDIA_BUCKET,
                `${OWNER_PREFIX}${owner}/`,
                clampLimit(url.searchParams.get("limit")),
                url.searchParams.get("cursor"),
            ),
        );
    },
);

api.get(
    "/tags/:tag",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "List public media by tag",
        description:
            "Lists media that was uploaded with the given tag, newest first. No auth — anyone tagging an upload opted in to public discovery by tag. Pass `?app=<keyId>` to scope to a single app's tag namespace (useful when apps use generic tag values like `recipe:water+fire`).",
        security: [],
        responses: {
            200: {
                description: "Catalog items",
                content: {
                    "application/json": {
                        schema: resolver(CatalogListResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid tag",
                content: {
                    "application/json": { schema: resolver(ErrorSchema) },
                },
            },
        },
    }),
    async (c) => {
        const rawTag = c.req.param("tag");
        const tag = rawTag.toLowerCase();
        if (!TAG_PATTERN.test(tag)) {
            return c.json({ error: "Invalid tag" }, 400);
        }
        const url = new URL(c.req.url);
        const app = safeFacet(url.searchParams.get("app"));
        const prefix = app
            ? `${TAG_BY_APP_PREFIX}${app}/${tag}/`
            : `${TAG_PREFIX}${tag}/`;
        return c.json(
            await listCatalog(
                c.env.MEDIA_BUCKET,
                prefix,
                clampLimit(url.searchParams.get("limit")),
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
            upload: "POST /upload (requires API key; optional ?tag=&prompt=&model=)",
            retrieve: "GET /:hash",
            myMedia: "GET /me/media (requires API key)",
            byTag: "GET /tags/:tag?app=<keyId>",
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
