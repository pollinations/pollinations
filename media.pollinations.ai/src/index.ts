import { Hono } from "hono";
import { cors } from "hono/cors";

const DOMAIN = "rhizome.pollinations.ai";
const ENTER_VERIFY_URL = "https://gen.pollinations.ai/api/account/key";

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

interface AuthResult {
    valid: boolean;
    type: string;
    name: string | null;
}

async function verifyApiKey(apiKey: string): Promise<AuthResult | null> {
    try {
        const res = await fetch(ENTER_VERIFY_URL, {
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
    const auth = req.headers.get("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];
    const url = new URL(req.url);
    return url.searchParams.get("key");
}

const app = new Hono<{ Bindings: Env }>();

app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "HEAD", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Content-Hash", "X-Content-Type", "X-Content-Size"],
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
            maxFileSize: "10MB",
            supportedTypes: ["image/*", "audio/*", "video/*"],
        },
    });
});

app.get("/openapi.json", (c) => {
    return c.json({
        openapi: "3.1.0",
        info: {
            title: "rhizome.pollinations.ai",
            version: "1.0.0",
            description: "Content-addressed media storage. Upload images, audio, and video with deduplication via SHA-256 hashing. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public.",
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
        paths: {
            "/upload": {
                post: {
                    tags: ["rhizome.pollinations.ai"],
                    summary: "Upload media",
                    description: "Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. Duplicate files return the existing hash.",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        file: { type: "string", format: "binary", description: "Media file (image/*, audio/*, video/*)" },
                                    },
                                    required: ["file"],
                                },
                            },
                            "image/*": { schema: { type: "string", format: "binary" } },
                            "audio/*": { schema: { type: "string", format: "binary" } },
                            "video/*": { schema: { type: "string", format: "binary" } },
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        data: { type: "string", description: "Base64-encoded file data (with or without data URI prefix)" },
                                        contentType: { type: "string", description: "MIME type (e.g. image/png)" },
                                        name: { type: "string", description: "Original filename" },
                                    },
                                    required: ["data"],
                                },
                            },
                        },
                    },
                    responses: {
                        "200": {
                            description: "Upload successful",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string", description: "12-char hex hash", example: "a1b2c3d4e5f6" },
                                            url: { type: "string", description: "Public retrieval URL" },
                                            contentType: { type: "string" },
                                            size: { type: "integer", description: "File size in bytes" },
                                            duplicate: { type: "boolean", description: "true if file already existed" },
                                        },
                                    },
                                },
                            },
                        },
                        "401": { description: "Missing or invalid API key" },
                        "413": { description: "File too large (max 10MB)" },
                        "415": { description: "Unsupported media type" },
                    },
                },
            },
            "/{hash}": {
                get: {
                    tags: ["rhizome.pollinations.ai"],
                    summary: "Retrieve media",
                    description: "Get a file by its content hash. No authentication required. Responses are cached immutably.",
                    parameters: [{
                        name: "hash",
                        in: "path",
                        required: true,
                        schema: { type: "string", pattern: "^[a-f0-9]{12}$" },
                        description: "12-character hex content hash",
                    }],
                    responses: {
                        "200": { description: "File content with appropriate Content-Type" },
                        "400": { description: "Invalid hash format" },
                        "404": { description: "File not found" },
                    },
                },
                head: {
                    tags: ["rhizome.pollinations.ai"],
                    summary: "Check if media exists",
                    description: "Check existence and metadata without downloading the file.",
                    parameters: [{
                        name: "hash",
                        in: "path",
                        required: true,
                        schema: { type: "string", pattern: "^[a-f0-9]{12}$" },
                        description: "12-character hex content hash",
                    }],
                    responses: {
                        "200": { description: "File exists (headers include Content-Type, Content-Length, X-Content-Hash)" },
                        "400": { description: "Invalid hash format" },
                        "404": { description: "File not found" },
                    },
                },
            },
        },
    });
});

app.post("/upload", async (c) => {
    const apiKey = extractApiKey(c.req.raw);
    if (!apiKey) {
        return c.json({ error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>" }, 401);
    }
    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
        return c.json({ error: "Invalid or expired API key" }, 401);
    }

    const maxSize = parseInt(c.env.MAX_FILE_SIZE || "10485760");

    let fileBuffer: ArrayBuffer;
    let contentType: string;
    let fileName: string | undefined;

    const requestContentType = c.req.header("content-type") || "";

    try {
        if (requestContentType.includes("multipart/form-data")) {
            const formData = await c.req.formData();
            const file: any = formData.get("file");

            if (!file || !(file instanceof File)) {
                return c.json({ error: "No file provided. Use 'file' field in form-data." }, 400);
            }

            if (file.size > maxSize) {
                return c.json({ error: `File too large. Max size: ${maxSize / 1024 / 1024}MB` }, 413);
            }

            fileBuffer = await file.arrayBuffer();
            contentType = file.type || detectContentType(file.name);
            fileName = file.name;
        } else if (requestContentType.includes("application/json")) {
            const body = await c.req.json<{ data: string; contentType?: string; name?: string }>();

            if (!body.data) {
                return c.json({ error: "Missing 'data' field in JSON body" }, 400);
            }

            const base64Data = body.data.includes(",") ? body.data.split(",")[1] : body.data;
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            fileBuffer = bytes.buffer;

            if (fileBuffer.byteLength > maxSize) {
                return c.json({ error: `File too large. Max size: ${maxSize / 1024 / 1024}MB` }, 413);
            }
            if (fileBuffer.byteLength === 0) {
                return c.json({ error: "Empty file" }, 400);
            }

            contentType = body.contentType || "application/octet-stream";
            fileName = body.name;
        } else {
            fileBuffer = await c.req.arrayBuffer();

            if (fileBuffer.byteLength > maxSize) {
                return c.json({ error: `File too large. Max size: ${maxSize / 1024 / 1024}MB` }, 413);
            }
            if (fileBuffer.byteLength === 0) {
                return c.json({ error: "Empty file" }, 400);
            }

            contentType = requestContentType || "application/octet-stream";
        }

        if (!isValidMediaType(contentType)) {
            return c.json({
                error: "Invalid file type. Supported: image/*, audio/*, video/*",
                received: contentType,
            }, 415);
        }

        const hash = await generateHash(fileBuffer);

        const existing = await c.env.MEDIA_BUCKET.head(hash);
        if (existing) {
            return c.json({
                id: hash,
                url: `https://${DOMAIN}/${hash}`,
                contentType: existing.httpMetadata?.contentType || contentType,
                size: existing.size,
                duplicate: true,
            });
        }

        await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
            httpMetadata: {
                contentType,
                cacheControl: "public, max-age=31536000, immutable",
            },
            customMetadata: {
                uploadedAt: new Date().toISOString(),
                originalName: fileName || "",
                uploadedBy: authResult.name || "",
                keyType: authResult.type,
            },
        });

        return c.json({
            id: hash,
            url: `https://${DOMAIN}/${hash}`,
            contentType,
            size: fileBuffer.byteLength,
            duplicate: false,
        });
    } catch (error) {
        console.error("Upload error:", error);
        return c.json({ error: "Upload failed" }, 500);
    }
});

app.get("/:hash", async (c) => {
    const hash = c.req.param("hash");

    if (!/^[a-f0-9]{12}$/i.test(hash)) {
        return c.json({ error: "Invalid hash format" }, 400);
    }

    try {
        const object = await c.env.MEDIA_BUCKET.get(hash);

        if (!object) {
            return c.json({ error: "Not found" }, 404);
        }

        const headers = new Headers();
        headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("X-Content-Hash", hash);
        headers.set("X-Content-Size", object.size.toString());

        if (object.httpMetadata?.contentType) {
            headers.set("X-Content-Type", object.httpMetadata.contentType);
        }

        return new Response(object.body, { headers });
    } catch (error) {
        console.error("Retrieve error:", error);
        return c.json({ error: "Retrieval failed" }, 500);
    }
});

app.on("HEAD", "/:hash", async (c) => {
    const hash = c.req.param("hash");

    if (!/^[a-f0-9]{12}$/i.test(hash)) {
        return new Response(null, { status: 400 });
    }

    try {
        const object = await c.env.MEDIA_BUCKET.head(hash);

        if (!object) {
            return new Response(null, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Content-Length", object.size.toString());
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("X-Content-Hash", hash);

        if (object.customMetadata?.uploadedAt) {
            headers.set("X-Uploaded-At", object.customMetadata.uploadedAt);
        }

        return new Response(null, { status: 200, headers });
    } catch (error) {
        return new Response(null, { status: 500 });
    }
});

async function generateHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fullHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return fullHash.substring(0, 12);
}

function isValidMediaType(contentType: string): boolean {
    const validPrefixes = ["image/", "audio/", "video/"];
    return validPrefixes.some((prefix) => contentType.startsWith(prefix));
}

function detectContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
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
    return mimeTypes[ext || ""] || "application/octet-stream";
}

export default app;
