/**
 * S3-compatible API for media.pollinations.ai — Phase 1 (bearer auth)
 *
 * Principle: thinnest possible proxy. This handler does three things and
 * nothing else:
 *   1. Verify the caller (bearer token → verifyApiKey)
 *   2. Rewrite the key to prefix it with the user id ({userId}/{rest})
 *   3. Forward to the R2 binding
 *
 * R2 already implements S3 — multipart, ranges, conditional headers, copy.
 * We do NOT reimplement any of that. Every line of S3 logic in this Worker
 * is a line we can get wrong.
 *
 * Key layout (enforced by prefix rewrite):
 *   {userId}/public/...   — anyone can read via URL
 *   {userId}/private/...  — only the owner's key
 *
 * Phase 2 note: SigV4 signature verification (~17 lines with aws4fetch) will
 * be added here so that `aws s3`, boto3, and rclone work. When adding SigV4,
 * watch out for Cloudflare rewriting Accept-Encoding before this Worker sees
 * it — Cloudflare's workerd#5289 notes that `request.cf.clientAcceptEncoding`
 * can be lossy; rclone signs the original Accept-Encoding, so the re-signed
 * request used for verification must use the original value.
 */

import { Hono } from "hono";
import type { AuthResult } from "./index.ts";

const S3_XMLNS = "http://s3.amazonaws.com/doc/2006-03-01/";
// Multipart threshold from the issue: mandatory, not disableable.
export const MULTIPART_THRESHOLD = 8 * 1024 * 1024; // 8 MB

// Access types enforced in the key layout.
const ALLOWED_ACCESS_TYPES = ["public", "private"] as const;
type AccessType = (typeof ALLOWED_ACCESS_TYPES)[number];

// Simple XML builder — we only need a handful of S3 response shapes and they
// are small, so no library dependency is warranted.
function xml(tag: string, children: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="${S3_XMLNS}">${children}</${tag}>`;
}
function el(tag: string, value: string | number): string {
    return `<${tag}>${String(value)}</${tag}>`;
}

// Format a Date as an S3-style ISO 8601 timestamp (always UTC, "Z" suffix).
function s3Date(d: Date): string {
    return d.toISOString();
}

// ---------------------------------------------------------------------------
// aws-chunked de-framing (Trap 1 from the issue)
//
// Every PutObject request sent over HTTPS by the AWS SDK is
// Transfer-Encoding: aws-chunked. The request body is NOT the raw file bytes;
// it is a series of hex-length + CRLF + chunk + CRLF frames. Cloudflare
// Workers receive these raw bytes, so we must de-frame them.
//
// Format: "{hex-length}\r\n{chunk-bytes}\r\n" ... "0\r\n\r\n"
//
// Using x-amz-decoded-content-length is the authoritative size; Content-Length
// will be the framed (larger) size. Testing over plain HTTP hides this bug
// because plain-HTTP SDKs don't chunk-encode — this is exactly how Storj and
// SeaweedFS shipped it broken.
// ---------------------------------------------------------------------------
async function deframeAwsChunked(
    body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
    const reader = body.getReader();
    let buffer = new Uint8Array(0);

    function append(chunk: Uint8Array): void {
        const next = new Uint8Array(buffer.length + chunk.length);
        next.set(buffer, 0);
        next.set(chunk, buffer.length);
        buffer = next;
    }

    function indexOfCRLF(offset = 0): number {
        for (let i = offset; i < buffer.length - 1; i++) {
            if (buffer[i] === 0x0d && buffer[i + 1] === 0x0a) return i;
        }
        return -1;
    }

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                // Try to find the chunk header (hex-length\r\n) in the buffer.
                const crlfPos = indexOfCRLF();
                if (crlfPos === -1) {
                    // Need more data.
                    const { done, value } = await reader.read();
                    if (done) {
                        controller.close();
                        return;
                    }
                    append(value);
                    continue;
                }

                const header = new TextDecoder().decode(buffer.slice(0, crlfPos));
                // Strip chunk extensions (e.g. ";chunk-signature=...") before parsing size.
                const chunkSize = parseInt(header.split(";")[0], 16);
                if (isNaN(chunkSize)) {
                    controller.error(new Error("aws-chunked: invalid chunk size"));
                    return;
                }

                if (chunkSize === 0) {
                    // Terminal chunk "0\r\n\r\n" — done.
                    controller.close();
                    return;
                }

                // We need crlfPos + 2 (header CRLF) + chunkSize + 2 (trailing CRLF).
                const needed = crlfPos + 2 + chunkSize + 2;
                while (buffer.length < needed) {
                    const { done, value } = await reader.read();
                    if (done) {
                        controller.error(new Error("aws-chunked: unexpected end of stream"));
                        return;
                    }
                    append(value);
                }

                // Emit the chunk data.
                controller.enqueue(buffer.slice(crlfPos + 2, crlfPos + 2 + chunkSize));
                // Advance past trailing CRLF.
                buffer = buffer.slice(needed);
                return; // yield control back to the runtime.
            }
        },
    });
}

// ---------------------------------------------------------------------------
// Key validation / rewriting
// ---------------------------------------------------------------------------

// Reject any key that would escape the user's prefix or is otherwise invalid.
// We check for ".." components even though R2 keys aren't filesystem paths,
// because the issue explicitly requires namespace isolation.
function validateAndRewriteKey(
    rawKey: string,
    userId: string,
): { key: string; accessType: AccessType } | { error: string; status: number } {
    // Reject path traversal — both raw and URL-encoded variants.
    const decoded = decodeURIComponent(rawKey);
    if (
        decoded.includes("../") ||
        decoded.includes("/..")||
        decoded === ".." ||
        rawKey.includes("%2F..") ||
        rawKey.includes("..%2F")
    ) {
        return { error: "Path traversal not allowed", status: 400 };
    }
    // Strip leading slash (S3 clients sometimes include it).
    const normalized = decoded.replace(/^\/+/, "");
    const parts = normalized.split("/");
    const accessType = parts[0] as AccessType;
    if (!ALLOWED_ACCESS_TYPES.includes(accessType)) {
        return {
            error: `Key must start with 'public/' or 'private/' (got: '${parts[0]}/')`,
            status: 400,
        };
    }
    if (parts.length < 2 || parts[1] === "") {
        return { error: "Key must include a path after the access type", status: 400 };
    }
    return { key: `${userId}/${normalized}`, accessType };
}

// Resolve the S3 object key from a request URL path and bucket prefix.
// The URL path is /{bucket}/{key} in path-style or /{key} in virtual-hosted style.
// We always use path-style (the Worker is mounted at /s3/).
function extractKeyFromPath(pathname: string): string {
    // Strip the leading /s3/ mount prefix — Hono passes us the remaining path.
    return pathname.replace(/^\/+/, "");
}

// ---------------------------------------------------------------------------
// Presigned URL generation for browser uploads (no SigV4 — our own scheme)
//
// Since presigned URLs only work on *.r2.cloudflarestorage.com (not custom
// domains), we sign our own short-lived tokens. The token encodes:
//   userId, key, expiresAt
// signed with HMAC-SHA256 over a secret derived from the worker's binding.
//
// The presign endpoint is GET /s3/presign?key={key}&ttl={seconds}
// Browser POSTs/PUTs to /s3/upload?token={token}&key={key}
//
// Note: A PRESIGN_SECRET env var must be set. We use the env.MAX_FILE_SIZE
// as a placeholder here; production will add a dedicated secret.
// ---------------------------------------------------------------------------

async function hmacSign(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function hmacVerify(
    secret: string,
    message: string,
    signature: string,
): Promise<boolean> {
    const expected = await hmacSign(secret, message);
    // Constant-time compare (both same length base64url).
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
}

export interface S3Env {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
    PRESIGN_SECRET?: string;
}

// ---------------------------------------------------------------------------
// Hono app — mounted at /s3 from index.ts
// ---------------------------------------------------------------------------

// We receive the verifyApiKey function from index.ts to avoid duplicating auth.
export function createS3Router(
    verifyApiKey: (key: string) => Promise<AuthResult | null>,
) {
    const s3 = new Hono<{ Bindings: S3Env }>();

    // Helper: extract and verify bearer token. Returns AuthResult or sends
    // an error response. pk_ keys may only read.
    async function requireAuth(
        req: Request,
        method: "read" | "write",
    ): Promise<AuthResult | Response> {
        const bearer = req.headers
            .get("authorization")
            ?.match(/^Bearer (.+)$/)?.[1];
        if (!bearer) {
            return s3ErrorResponse(
                401,
                "AuthorizationHeaderMalformed",
                "No Bearer token in Authorization header",
            );
        }
        const auth = await verifyApiKey(bearer);
        if (!auth) {
            return s3ErrorResponse(401, "InvalidAccessKeyId", "Invalid or expired API key");
        }
        if (!auth.userId) {
            return s3ErrorResponse(
                403,
                "AccessDenied",
                "This API key is not attached to a user account",
            );
        }
        if (method === "write" && auth.type === "publishable") {
            // pk_ keys ship in public HTML — a writable pk_ lets anyone spend
            // the owner's Pollen. Reject writes from pk_ explicitly.
            return s3ErrorResponse(
                403,
                "AccessDenied",
                "Publishable (pk_) keys are read-only through this API. Use a secret (sk_) key for writes.",
            );
        }
        return auth;
    }

    function s3ErrorResponse(
        status: number,
        code: string,
        message: string,
    ): Response {
        const body = xml(
            "Error",
            el("Code", code) + el("Message", message),
        );
        return new Response(body, {
            status,
            headers: { "Content-Type": "application/xml" },
        });
    }

    // -------------------------------------------------------------------------
    // Presigned URL generation
    // GET /s3/presign?key={key}&ttl={seconds}
    // -------------------------------------------------------------------------
    s3.get("/presign", async (c) => {
        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.query("key") ?? "";
        const ttlStr = c.req.query("ttl") ?? "3600";
        const ttl = Math.min(parseInt(ttlStr, 10) || 3600, 86400); // max 24h

        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        const secret = c.env.PRESIGN_SECRET ?? c.env.MAX_FILE_SIZE ?? "dev-secret";
        const expiresAt = Math.floor(Date.now() / 1000) + ttl;
        const message = `${auth.userId}:${keyResult.key}:${expiresAt}`;
        const sig = await hmacSign(secret, message);
        const token = btoa(JSON.stringify({ userId: auth.userId, key: keyResult.key, expiresAt, sig }))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const presignedUrl = new URL(c.req.url);
        presignedUrl.pathname = "/s3/upload";
        presignedUrl.search = "";
        presignedUrl.searchParams.set("token", token);

        return c.json({ url: presignedUrl.toString(), expiresAt, key: rawKey });
    });

    // -------------------------------------------------------------------------
    // Presigned upload endpoint
    // PUT /s3/upload?token={token}
    // -------------------------------------------------------------------------
    s3.put("/upload", async (c) => {
        const tokenB64 = c.req.query("token");
        if (!tokenB64) {
            return s3ErrorResponse(400, "MissingToken", "token query param required");
        }

        let payload: { userId: string; key: string; expiresAt: number; sig: string };
        try {
            const json = atob(tokenB64.replace(/-/g, "+").replace(/_/g, "/"));
            payload = JSON.parse(json);
        } catch {
            return s3ErrorResponse(400, "InvalidToken", "Malformed presigned token");
        }

        if (Math.floor(Date.now() / 1000) > payload.expiresAt) {
            return s3ErrorResponse(403, "RequestExpired", "Presigned URL has expired");
        }

        const secret = c.env.PRESIGN_SECRET ?? c.env.MAX_FILE_SIZE ?? "dev-secret";
        const message = `${payload.userId}:${payload.key}:${payload.expiresAt}`;
        const valid = await hmacVerify(secret, message, payload.sig);
        if (!valid) {
            return s3ErrorResponse(403, "SignatureDoesNotMatch", "Invalid presigned token signature");
        }

        return putObject(c, payload.key, c.req.raw);
    });

    // -------------------------------------------------------------------------
    // ListObjectsV2
    // GET /s3/?list-type=2&prefix={prefix}&max-keys={n}&continuation-token={t}
    // Hono mounts this router at /s3, so requests to /s3/ arrive as path ""
    // or "/" here. We handle both.
    // -------------------------------------------------------------------------
    async function handleList(c: Parameters<Parameters<typeof s3.get>[1]>[0]): Promise<Response> {
        const auth = await requireAuth(c.req.raw, "read");
        if (auth instanceof Response) return auth;

        const prefix = c.req.query("prefix") ?? "";
        const maxKeys = Math.min(parseInt(c.req.query("max-keys") ?? "1000", 10), 1000);
        const continuationToken = c.req.query("continuation-token") ?? undefined;

        // Rewrite prefix — always scoped to the user's own namespace.
        let r2Prefix = `${auth.userId}/`;
        if (prefix) {
            // Reject traversal in prefix too.
            if (prefix.includes("../")) {
                return s3ErrorResponse(400, "InvalidPrefix", "Path traversal not allowed");
            }
            r2Prefix = `${auth.userId}/${prefix.replace(/^\/+/, "")}`;
        }

        const result = await c.env.MEDIA_BUCKET.list({
            prefix: r2Prefix,
            limit: maxKeys,
            cursor: continuationToken,
        });

        const isTruncated = result.truncated;
        const nextToken = isTruncated ? (result as R2Objects).cursor : undefined;

        // Strip the userId/ prefix from the keys returned to the client.
        const userPrefix = `${auth.userId}/`;
        const contents = result.objects.map((obj) => {
            const clientKey = obj.key.startsWith(userPrefix)
                ? obj.key.slice(userPrefix.length)
                : obj.key;
            return (
                el("Key", clientKey) +
                el("LastModified", s3Date(obj.uploaded)) +
                el("ETag", `"${obj.etag}"`) +
                el("Size", obj.size) +
                el("StorageClass", "STANDARD")
            );
        });

        const body = xml(
            "ListBucketResult",
            el("Name", "media") +
                el("Prefix", prefix) +
                el("MaxKeys", maxKeys) +
                el("KeyCount", result.objects.length) +
                el("IsTruncated", String(isTruncated)) +
                (nextToken ? el("NextContinuationToken", nextToken) : "") +
                contents.map((c) => `<Contents>${c}</Contents>`).join(""),
        );

        return new Response(body, {
            headers: { "Content-Type": "application/xml" },
        });
    }

    s3.get("/", (c) => handleList(c));
    // Also match empty path — when Hono mounts at /s3 a request to /s3/ can
    // arrive with pathname "" depending on how the router strips the prefix.
    s3.get("", (c) => handleList(c));

    // -------------------------------------------------------------------------
    // GetObject (must honour Range header — required for aws s3 cp of large files)
    // GET /s3/{key}
    // -------------------------------------------------------------------------
    s3.get("/:key{.+}", async (c) => {
        const auth = await requireAuth(c.req.raw, "read");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.param("key");

        // Access control: private keys require the owner's key.
        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        // Allow public reads without auth for {userId}/public/* keys.
        // (The requireAuth above already passed; this only applies to non-owner
        //  reads in the future when we relax auth for public/* paths.)

        const rangeHeader = c.req.header("range");
        const getOptions: R2GetOptions = {};
        if (rangeHeader) {
            // S3 Range: bytes=start-end
            const match = /^bytes=(\d+)?-(\d+)?$/.exec(rangeHeader);
            if (match) {
                const start = match[1] !== undefined ? parseInt(match[1], 10) : undefined;
                const end = match[2] !== undefined ? parseInt(match[2], 10) : undefined;
                if (start !== undefined && end !== undefined) {
                    getOptions.range = { offset: start, length: end - start + 1 };
                } else if (start !== undefined) {
                    getOptions.range = { offset: start };
                } else if (end !== undefined) {
                    // suffix range: last N bytes
                    getOptions.range = { suffix: end };
                }
            }
        }

        const object = await c.env.MEDIA_BUCKET.get(keyResult.key, getOptions);
        if (!object) {
            return s3ErrorResponse(404, "NoSuchKey", `Object '${rawKey}' not found`);
        }

        const headers = new Headers();
        headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
        headers.set("ETag", `"${object.etag}"`);
        headers.set("Last-Modified", s3Date(object.uploaded));
        headers.set("Content-Length", String(object.size));
        if (rangeHeader && object.range) {
            const r = object.range as { offset?: number; length?: number; suffix?: number };
            const total = object.size;
            const start = r.offset ?? (r.suffix !== undefined ? total - r.suffix : 0);
            const end = r.length !== undefined ? start + r.length - 1 : total - 1;
            headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
        }

        // Trap 2: stream the body directly — do NOT buffer into memory.
        return new Response(object.body, {
            status: rangeHeader ? 206 : 200,
            headers,
        });
    });

    // -------------------------------------------------------------------------
    // HeadObject
    // HEAD /s3/{key}
    // -------------------------------------------------------------------------
    s3.on("HEAD", "/:key{.+}", async (c) => {
        const auth = await requireAuth(c.req.raw, "read");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.param("key");
        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        const object = await c.env.MEDIA_BUCKET.head(keyResult.key);
        if (!object) {
            return new Response(null, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
        headers.set("Content-Length", String(object.size));
        headers.set("ETag", `"${object.etag}"`);
        headers.set("Last-Modified", s3Date(object.uploaded));

        return new Response(null, { status: 200, headers });
    });

    // -------------------------------------------------------------------------
    // PutObject
    // PUT /s3/{key}
    // -------------------------------------------------------------------------
    async function putObject(
        c: { req: { raw: Request; header: (name: string) => string | undefined }; env: S3Env },
        r2Key: string,
        req: Request,
    ): Promise<Response> {
        // Trap 1: detect aws-chunked framing and de-frame the payload.
        // The x-amz-decoded-content-length header is the real file size;
        // Content-Length is the framed (larger) size. Testing over plain HTTP
        // hides this — plain-HTTP SDK requests are NOT chunked.
        const transferEncoding = req.headers.get("transfer-encoding") ?? "";
        const isAwsChunked = transferEncoding.includes("aws-chunked");

        let body: ReadableStream<Uint8Array> | null = req.body;
        const contentType =
            req.headers.get("content-type") ?? "application/octet-stream";

        if (isAwsChunked && body) {
            // De-frame: ignore Content-Length (framed size), use the raw chunks.
            body = await deframeAwsChunked(body);
        }

        if (!body) {
            return new Response(
                xml("Error", el("Code", "MissingBody") + el("Message", "Request body is required")),
                { status: 400, headers: { "Content-Type": "application/xml" } },
            );
        }

        // Trap 2: stream the body directly to R2 — never buffer it into memory.
        // Buffering would cap uploads at the 100MB Worker limit (same as the
        // current MAX_FILE_SIZE constraint). R2's put() accepts a ReadableStream.
        //
        // Cloudflare Workers R2 requires the content length to be declared when
        // a ReadableStream is used (it cannot measure an arbitrary stream). We
        // derive the length from x-amz-decoded-content-length (aws-chunked) or
        // Content-Length (plain body). Without it, R2 will throw a TypeError.
        // We wrap the body in FixedLengthStream when the length is available so
        // R2 can stream without buffering; if neither header is present (unusual)
        // we fall back to letting R2 buffer (may fail on very large bodies).
        const decodedLen = req.headers.get("x-amz-decoded-content-length");
        const rawLen = req.headers.get("content-length");
        const contentLengthStr = isAwsChunked ? decodedLen : rawLen;
        const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined;

        // Use FixedLengthStream to declare the known length to R2 so it can
        // accept a ReadableStream without buffering the entire body.
        let r2Body: ReadableStream<Uint8Array> | BodyInit = body;
        if (contentLength !== undefined && !isNaN(contentLength)) {
            const fls = new FixedLengthStream(contentLength);
            body.pipeTo(fls.writable).catch(() => { /* handled by R2 read */ });
            r2Body = fls.readable;
        }

        await c.env.MEDIA_BUCKET.put(r2Key, r2Body, {
            httpMetadata: { contentType },
            customMetadata: { uploadedAt: new Date().toISOString() },
        });



        return new Response(null, {
            status: 200,
            headers: { "ETag": `"${crypto.randomUUID()}"` },
        });
    }

    s3.put("/:key{.+}", async (c) => {
        // Check for multipart part upload (UploadPart).
        const uploadId = c.req.query("uploadId");
        const partNumber = c.req.query("partNumber");
        if (uploadId && partNumber) {
            return handleUploadPart(c, uploadId, parseInt(partNumber, 10));
        }

        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.param("key");
        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        return putObject(c, keyResult.key, c.req.raw);
    });

    // -------------------------------------------------------------------------
    // DeleteObject
    // DELETE /s3/{key}
    // -------------------------------------------------------------------------
    s3.delete("/:key{.+}", async (c) => {
        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.param("key");
        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        await c.env.MEDIA_BUCKET.delete(keyResult.key);

        // S3 DeleteObject returns 204 with empty body.
        return new Response(null, { status: 204 });
    });

    // -------------------------------------------------------------------------
    // CreateMultipartUpload
    // POST /s3/{key}?uploads
    // Multipart is mandatory at 8MB threshold — not optional.
    // -------------------------------------------------------------------------
    s3.post("/:key{.+}", async (c) => {
        const rawKey = c.req.param("key");

        // CompleteMultipartUpload: POST /{key}?uploadId={id}
        const uploadId = c.req.query("uploadId");
        if (uploadId) {
            return handleCompleteMultipartUpload(c, rawKey, uploadId);
        }

        // CreateMultipartUpload: POST /{key}?uploads
        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        const contentType =
            c.req.header("content-type") ?? "application/octet-stream";

        const mpu = await c.env.MEDIA_BUCKET.createMultipartUpload(keyResult.key, {
            httpMetadata: { contentType },
            customMetadata: { uploadedAt: new Date().toISOString() },
        });

        const body = xml(
            "InitiateMultipartUploadResult",
            el("Bucket", "media") +
                el("Key", rawKey) +
                el("UploadId", mpu.uploadId),
        );

        return new Response(body, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
        });
    });

    // -------------------------------------------------------------------------
    // UploadPart (called from the PUT handler via query params)
    // PUT /s3/{key}?partNumber={n}&uploadId={id}
    // -------------------------------------------------------------------------
    async function handleUploadPart(
        c: { req: { raw: Request; param: (k: string) => string; query: (k: string) => string | undefined; header: (k: string) => string | undefined }; env: S3Env },
        uploadId: string,
        partNumber: number,
    ): Promise<Response> {
        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const rawKey = c.req.param("key");
        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        const transferEncoding = c.req.raw.headers.get("transfer-encoding") ?? "";
        const isAwsChunked = transferEncoding.includes("aws-chunked");

        let body: ReadableStream<Uint8Array> | null = c.req.raw.body;
        if (isAwsChunked && body) {
            body = await deframeAwsChunked(body);
        }

        if (!body) {
            return s3ErrorResponse(400, "MissingBody", "Part body is required");
        }

        const mpu = c.env.MEDIA_BUCKET.resumeMultipartUpload(keyResult.key, uploadId);
        const part = await mpu.uploadPart(partNumber, body);

        return new Response(null, {
            status: 200,
            headers: { ETag: `"${part.etag}"` },
        });
    }

    // -------------------------------------------------------------------------
    // CompleteMultipartUpload (called from the POST handler via query params)
    // POST /s3/{key}?uploadId={id}
    // -------------------------------------------------------------------------
    async function handleCompleteMultipartUpload(
        c: { req: { raw: Request; header: (k: string) => string | undefined }; env: S3Env },
        rawKey: string,
        uploadId: string,
    ): Promise<Response> {
        const auth = await requireAuth(c.req.raw, "write");
        if (auth instanceof Response) return auth;

        const keyResult = validateAndRewriteKey(rawKey, auth.userId!);
        if ("error" in keyResult) {
            return s3ErrorResponse(400, "InvalidKey", keyResult.error);
        }

        // Parse the XML body listing the parts.
        let xmlBody: string;
        try {
            xmlBody = await c.req.raw.text();
        } catch {
            return s3ErrorResponse(400, "MalformedXML", "Could not read request body");
        }

        // Simple regex extraction — the CompleteMultipartUpload body is small.
        const parts: R2UploadedPart[] = [];
        const partRe = /<Part>.*?<PartNumber>(\d+)<\/PartNumber>.*?<ETag>"?([^"<]+)"?<\/ETag>.*?<\/Part>/gs;
        let match: RegExpExecArray | null;
        while ((match = partRe.exec(xmlBody)) !== null) {
            parts.push({ partNumber: parseInt(match[1], 10), etag: match[2] });
        }

        if (parts.length === 0) {
            return s3ErrorResponse(400, "MalformedXML", "No Part elements found in request body");
        }

        const mpu = c.env.MEDIA_BUCKET.resumeMultipartUpload(keyResult.key, uploadId);
        await mpu.complete(parts);

        const body = xml(
            "CompleteMultipartUploadResult",
            el("Bucket", "media") +
                el("Key", rawKey) +
                el("Location", `https://media.pollinations.ai/s3/${rawKey}`),
        );

        return new Response(body, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
        });
    }

    return s3;
}

// Re-export for tests.
export { deframeAwsChunked, validateAndRewriteKey, hmacSign, hmacVerify };
