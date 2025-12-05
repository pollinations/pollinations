/**
 * media.pollinations.ai - Content-addressed media upload service
 *
 * Upload media files (images/audio/video) and get back a content-addressed URL.
 * Uses SHA-256 hashing for deduplication - identical files return the same URL.
 *
 * Following the "thin proxy" design principle - minimal code, maximum utility.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

interface Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for browser uploads
app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
        exposeHeaders: ["X-Content-Hash", "X-Content-Type", "X-Content-Size"],
    }),
);

// Health check
app.get("/", (c) => {
    return c.json({
        service: "media.pollinations.ai",
        version: "1.0.0",
        endpoints: {
            upload: "POST /upload",
            retrieve: "GET /:hash",
        },
        limits: {
            maxFileSize: "10MB",
            supportedTypes: ["image/*", "audio/*", "video/*"],
        },
    });
});

/**
 * Upload endpoint - accepts multipart/form-data or raw binary
 * Returns content-addressed hash URL
 */
app.post("/upload", async (c) => {
    const maxSize = parseInt(c.env.MAX_FILE_SIZE || "10485760");

    let fileBuffer: ArrayBuffer;
    let contentType: string;
    let fileName: string | undefined;

    const requestContentType = c.req.header("content-type") || "";

    try {
        if (requestContentType.includes("multipart/form-data")) {
            // Handle multipart/form-data
            const formData = await c.req.formData();
            const file = formData.get("file");

            if (!file || !(file instanceof File)) {
                return c.json(
                    {
                        error: "No file provided. Use 'file' field in form-data.",
                    },
                    400,
                );
            }

            if (file.size > maxSize) {
                return c.json(
                    {
                        error: `File too large. Max size: ${maxSize / 1024 / 1024}MB`,
                    },
                    413,
                );
            }

            fileBuffer = await file.arrayBuffer();
            contentType = file.type || detectContentType(file.name);
            fileName = file.name;
        } else {
            // Handle raw binary upload
            fileBuffer = await c.req.arrayBuffer();

            if (fileBuffer.byteLength > maxSize) {
                return c.json(
                    {
                        error: `File too large. Max size: ${maxSize / 1024 / 1024}MB`,
                    },
                    413,
                );
            }

            if (fileBuffer.byteLength === 0) {
                return c.json({ error: "Empty file" }, 400);
            }

            contentType = requestContentType || "application/octet-stream";
        }

        // Validate content type
        if (!isValidMediaType(contentType)) {
            return c.json(
                {
                    error: "Invalid file type. Supported: image/*, audio/*, video/*",
                    received: contentType,
                },
                415,
            );
        }

        // Generate SHA-256 hash of content
        const hash = await generateHash(fileBuffer);

        // Check if already exists (deduplication)
        const existing = await c.env.MEDIA_BUCKET.head(hash);
        if (existing) {
            // File already exists, return existing URL
            return c.json({
                id: hash,
                url: `https://media.pollinations.ai/${hash}`,
                contentType: existing.httpMetadata?.contentType || contentType,
                size: existing.size,
                duplicate: true,
            });
        }

        // Store in R2 with content-type metadata
        await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
            httpMetadata: {
                contentType,
                cacheControl: "public, max-age=31536000, immutable",
            },
            customMetadata: {
                uploadedAt: new Date().toISOString(),
                originalName: fileName || "",
            },
        });

        return c.json({
            id: hash,
            url: `https://media.pollinations.ai/${hash}`,
            contentType,
            size: fileBuffer.byteLength,
            duplicate: false,
        });
    } catch (error) {
        console.error("Upload error:", error);
        return c.json({ error: "Upload failed" }, 500);
    }
});

/**
 * Retrieve endpoint - serves media by hash
 */
app.get("/:hash", async (c) => {
    const hash = c.req.param("hash");

    // Validate hash format (SHA-256 = 64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
        return c.json({ error: "Invalid hash format" }, 400);
    }

    try {
        const object = await c.env.MEDIA_BUCKET.get(hash);

        if (!object) {
            return c.json({ error: "Not found" }, 404);
        }

        // Set response headers
        const headers = new Headers();
        headers.set(
            "Content-Type",
            object.httpMetadata?.contentType || "application/octet-stream",
        );
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

/**
 * Metadata endpoint - get info about a file without downloading
 * Using app.on() for HEAD method since app.head() may not be available in all Hono versions
 */
app.on("HEAD", "/:hash", async (c) => {
    const hash = c.req.param("hash");

    if (!/^[a-f0-9]{64}$/i.test(hash)) {
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

/**
 * Generate SHA-256 hash of content
 */
async function generateHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if content type is a valid media type
 */
function isValidMediaType(contentType: string): boolean {
    const validPrefixes = ["image/", "audio/", "video/"];
    return validPrefixes.some((prefix) => contentType.startsWith(prefix));
}

/**
 * Detect content type from file extension
 */
function detectContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        // Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        ico: "image/x-icon",
        // Audio
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        m4a: "audio/mp4",
        flac: "audio/flac",
        aac: "audio/aac",
        // Video
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        avi: "video/x-msvideo",
        mkv: "video/x-matroska",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
}

export default app;
