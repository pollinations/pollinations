import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";

const DOMAIN = "media.pollinations.ai";
// gen.pollinations.ai proxies /account/* to enter — using the public path
// keeps internal services consistent with the documented SDK/external usage.
const KEY_VERIFY_PATH = "/account/key";
const STORAGE_CHARGE_PATH = "/account/storage-charge";
// Keep in sync with shared/http/cache-control.ts (IMMUTABLE_CACHE_CONTROL).
// Content-addressed storage means the URL → bytes mapping is fixed forever:
// re-uploading the same content reproduces the same URL, and there is no
// other content the URL could ever point to. R2's lifecycle can delete the
// underlying object, but a fresh upload restores byte-identical content, so
// `immutable` is safe.
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASH_PATTERN = /^[a-f0-9]{16}$/i;
const DEFAULT_MAX_SIZE = 52428800; // 50 MB
const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 0.01; // ~14 minutes; supports 0.04 ≈ 1h short-lived uploads
const MAX_RETENTION_DAYS = 730; // ~2 years

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
    BILLING_URL: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
}

async function verifyApiKey(
    billingUrl: string,
    apiKey: string,
): Promise<AuthResult | null> {
    try {
        const res = await fetch(`${billingUrl}${KEY_VERIFY_PATH}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const data = await res.json<AuthResult>();
        return data.valid ? data : null;
    } catch {
        return null;
    }
}

async function chargeStorage(
    billingUrl: string,
    apiKey: string,
    sizeBytes: number,
    days: number,
    hash: string,
): Promise<{ ok: boolean; costPollen: number; error?: string }> {
    try {
        const res = await fetch(`${billingUrl}${STORAGE_CHARGE_PATH}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sizeBytes, days, hash }),
        });
        const data = await res.json<{
            ok: boolean;
            costPollen: number;
            error?: string;
        }>();
        return {
            ok: res.ok && data.ok,
            costPollen: data.costPollen ?? 0,
            error: data.error,
        };
    } catch {
        return {
            ok: false,
            costPollen: 0,
            error: "Billing service unavailable",
        };
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
    expiresAt: z.string().describe("ISO-8601 expiry timestamp"),
    retentionDays: z.number().describe("Retention period in days"),
    costPollen: z.number().describe("Pollen charged for storage"),
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
    expiresAt: z.string().optional().describe("ISO-8601 expiry timestamp"),
    retentionDays: z.number().optional().describe("Retention period in days"),
});

const api = new Hono<{ Bindings: Env }>();

api.post(
    "/upload",
    describeRoute({
        tags: ["media.pollinations.ai"],
        summary: "Upload media",
        description:
            "Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Use `?expires` (float days, default 30, range 0.01–730) to set the retention period. Storage is billed upfront: `cost_pollen = size_GB × days × 0.000767`.",
        responses: {
            200: {
                description: "Upload successful",
                content: {
                    "application/json": {
                        schema: resolver(UploadResponseSchema),
                    },
                },
            },
            400: {
                description: "Invalid request or days parameter out of range",
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
            402: {
                description: "Insufficient Pollen balance",
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

        const billingUrl = c.env.BILLING_URL;
        const authResult = await verifyApiKey(billingUrl, apiKey);
        if (!authResult) {
            return c.json({ error: "Invalid or expired API key" }, 401);
        }

        // Parse and validate retention period
        const expiresParam = new URL(c.req.url).searchParams.get("expires");
        let retentionDays = DEFAULT_RETENTION_DAYS;
        if (expiresParam !== null) {
            const parsed = Number(expiresParam);
            if (
                !Number.isFinite(parsed) ||
                parsed < MIN_RETENTION_DAYS ||
                parsed > MAX_RETENTION_DAYS
            ) {
                return c.json(
                    {
                        error: `Invalid 'expires' parameter. Must be a number between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.`,
                    },
                    400,
                );
            }
            retentionDays = parsed;
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

            // Debit pollen before writing to R2 — on failure nothing was stored.
            const charge = await chargeStorage(
                billingUrl,
                apiKey,
                fileBuffer.byteLength,
                retentionDays,
                hash,
            );
            if (!charge.ok) {
                return c.json(
                    {
                        error: charge.error ?? "Insufficient Pollen balance",
                        costPollen: charge.costPollen,
                    },
                    402,
                );
            }

            const expiresAt = new Date(
                Date.now() + retentionDays * 24 * 60 * 60 * 1000,
            ).toISOString();

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
                    expiresAt,
                    retentionDays: String(retentionDays),
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
                    retentionDays,
                    expiresAt,
                    costPollen: charge.costPollen,
                }),
            );

            return c.json({
                id: hash,
                url: mediaUrl(hash),
                contentType,
                size: fileBuffer.byteLength,
                duplicate: !!existing,
                expiresAt,
                retentionDays,
                costPollen: charge.costPollen,
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
            "Get a file by its content hash. No authentication required. Responses are cached immutably. Returns 410 if the file has expired. Access resets the TTL for recently-uploaded files.",
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
            410: {
                description: "File has expired",
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

            const expiresAtStr = object.customMetadata?.expiresAt;
            if (expiresAtStr && new Date(expiresAtStr) < new Date()) {
                return c.json({ error: "Content has expired" }, 410);
            }

            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("Cache-Control", CACHE_CONTROL);
            headers.set("X-Content-Hash", hash);
            headers.set("X-Content-Size", object.size.toString());

            if (expiresAtStr) {
                headers.set("X-Expires-At", expiresAtStr);
            }

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
            "Return file metadata (hash, content type, size, upload timestamp, expiry) as JSON without downloading the file body.",
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
            const retentionDaysStr = object.customMetadata?.retentionDays;
            return c.json({
                hash,
                contentType:
                    object.httpMetadata?.contentType ||
                    "application/octet-stream",
                size: object.size,
                ...(object.customMetadata?.uploadedAt && {
                    uploadedAt: object.customMetadata.uploadedAt,
                }),
                ...(object.customMetadata?.expiresAt && {
                    expiresAt: object.customMetadata.expiresAt,
                }),
                ...(retentionDaysStr && {
                    retentionDays: Number(retentionDaysStr),
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
            "Check existence and metadata without downloading the file. Returns 410 if the file has expired.",
        security: [],
        responses: {
            200: {
                description:
                    "File exists (headers include Content-Type, Content-Length, X-Content-Hash)",
            },
            400: { description: "Invalid hash format" },
            404: { description: "File not found" },
            410: { description: "File has expired" },
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

            const expiresAtStr = object.customMetadata?.expiresAt;
            if (expiresAtStr && new Date(expiresAtStr) < new Date()) {
                return new Response(null, { status: 410 });
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
            if (expiresAtStr) {
                headers.set("X-Expires-At", expiresAtStr);
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
        exposeHeaders: ["X-Content-Hash", "X-Content-Size", "X-Expires-At"],
    }),
);

app.get("/", (c) => {
    return c.json({
        service: DOMAIN,
        version: "1.0.0",
        endpoints: {
            upload: "POST /upload (requires API key)",
            retrieve: "GET /:hash",
            docs: "GET /openapi.json",
        },
        limits: {
            maxFileSize: "50MB",
            expires: {
                default: DEFAULT_RETENTION_DAYS,
                min: MIN_RETENTION_DAYS,
                max: MAX_RETENTION_DAYS,
                unit: "days",
            },
        },
        pricing: {
            formula: "cost_pollen = size_GB × days × 0.000767",
            ratePerGBDay: 0.023 / 30,
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
                    "Content-addressed media storage. Upload images, audio, and video with deduplication via SHA-256 hashing. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public. Storage is billed upfront in Pollen: `cost = size_GB × days × 0.000767`.",
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

// Cron trigger: daily at 04:00 UTC. Scans all R2 objects and deletes any that
// have an expiresAt metadata field in the past.
async function deleteExpiredObjects(env: Env): Promise<void> {
    const bucket = env.MEDIA_BUCKET;
    const now = Date.now();
    let deleted = 0;
    let cursor: string | undefined;

    do {
        const listed = await bucket.list({
            limit: 1000,
            cursor,
            include: ["customMetadata"],
        });

        for (const obj of listed.objects) {
            const expiresAtStr = obj.customMetadata?.expiresAt;
            if (expiresAtStr && new Date(expiresAtStr).getTime() < now) {
                await bucket.delete(obj.key);
                deleted++;
            }
        }

        cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    console.log(
        JSON.stringify({
            event: "cleanup",
            deleted,
            timestamp: new Date().toISOString(),
        }),
    );
}

export default {
    fetch: app.fetch,
    async scheduled(
        _event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        ctx.waitUntil(deleteExpiredObjects(env));
    },
};
