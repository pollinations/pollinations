import { Hono } from "hono";
import { decodeAwsChunkedBody } from "./chunked.ts";
import { type KeyDetails, lookupKeyById, verifySigV4 } from "./sigv4.ts";

const DOMAIN = "media.pollinations.ai";

interface S3AuthContext {
    userId: string;
    keyType: "secret" | "publishable";
    byopClientKeyId: string | null;
    keyId: string;
}

export const s3App = new Hono<{ Bindings: { MEDIA_BUCKET: R2Bucket } }>();

// Helper to construct XML responses
function xmlResponse(
    xml: string,
    status = 200,
    headers?: Record<string, string>,
): Response {
    return new Response(xml, {
        status,
        headers: {
            "Content-Type": "application/xml",
            ...headers,
        },
    });
}

function s3ErrorXml(code: string, message: string, resource = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>${code}</Code>
    <Message>${message}</Message>
    <Resource>${resource}</Resource>
    <RequestId>${crypto.randomUUID()}</RequestId>
</Error>`;
}

// Authenticate incoming request via SigV4 or Bearer
async function authenticateS3Request(
    req: Request,
): Promise<S3AuthContext | null> {
    const url = new URL(req.url);

    // 1. Check SigV4 (Authorization header or Presigned query params)
    const authHeader = req.headers.get("authorization");
    const isSigV4Header = authHeader?.startsWith("AWS4-HMAC-SHA256");
    const isPresigned = url.searchParams.has("X-Amz-Signature");

    if (isSigV4Header || isPresigned) {
        let accessKeyId: string | null = null;
        if (isSigV4Header && authHeader) {
            const match = authHeader.match(/Credential=([^/]+)/);
            if (match) accessKeyId = match[1];
        } else if (isPresigned) {
            const cred = url.searchParams.get("X-Amz-Credential");
            if (cred) accessKeyId = cred.split("/")[0];
        }

        if (!accessKeyId) return null;

        const keyDetails = await lookupKeyById(accessKeyId);
        if (!keyDetails) return null;

        const isValidSig = await verifySigV4(req, keyDetails);
        if (!isValidSig) return null;

        return {
            userId: keyDetails.userId,
            keyType: keyDetails.type,
            byopClientKeyId: keyDetails.byopClientKeyId,
            keyId: keyDetails.id,
        };
    }

    // 2. Check Bearer token or ?key=
    const bearer =
        authHeader?.match(/^Bearer (.+)$/)?.[1] || url.searchParams.get("key");
    if (bearer) {
        try {
            const res = await fetch("https://gen.pollinations.ai/account/key", {
                headers: { Authorization: `Bearer ${bearer}` },
            });
            if (!res.ok) return null;
            const data = await res.json<{
                valid: boolean;
                type: string;
                userId: string | null;
                byopApp: { clientKeyId: string } | null;
            }>();
            if (!data || !data.valid || !data.userId) return null;

            return {
                userId: data.userId,
                keyType: data.type === "publishable" ? "publishable" : "secret",
                byopClientKeyId: data.byopApp?.clientKeyId ?? null,
                keyId: "bearer",
            };
        } catch {
            return null;
        }
    }

    return null;
}

// Map path to user-prefixed R2 object key
function resolveObjectKey(
    path: string,
    userId: string,
): { key: string; isPublic: boolean; rawPath: string } | null {
    // Path example: /media/{userId}/public/foo.png or /{userId}/public/foo.png or /public/foo.png
    let cleanPath = path.replace(/^\/+/, "");

    // Strip bucket name if first path segment matches standard bucket names (e.g. "media" or "pollinations")
    const segments = cleanPath.split("/");
    if (
        segments.length > 0 &&
        (segments[0] === "media" || segments[0] === "pollinations")
    ) {
        segments.shift();
        cleanPath = segments.join("/");
    }

    // Strip userId if prefix is already present
    if (cleanPath.startsWith(`${userId}/`)) {
        cleanPath = cleanPath.substring(userId.length + 1);
    }

    if (cleanPath.startsWith("public/")) {
        return {
            key: `${userId}/${cleanPath}`,
            isPublic: true,
            rawPath: cleanPath,
        };
    } else if (cleanPath.startsWith("private/")) {
        return {
            key: `${userId}/${cleanPath}`,
            isPublic: false,
            rawPath: cleanPath,
        };
    }

    return null;
}

// ListBuckets (GET /)
s3App.get("/", async (c) => {
    const url = new URL(c.req.raw.url);
    // If query has prefix or max-keys, this is ListObjects on root
    if (url.searchParams.has("list-type") || url.searchParams.has("prefix")) {
        return handleListObjects(c);
    }

    const auth = await authenticateS3Request(c.req.raw);
    if (!auth) {
        return xmlResponse(s3ErrorXml("AccessDenied", "Access Denied"), 403);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Owner>
        <ID>${auth.userId}</ID>
        <DisplayName>${auth.userId}</DisplayName>
    </Owner>
    <Buckets>
        <Bucket>
            <Name>media</Name>
            <CreationDate>2026-01-01T00:00:00.000Z</CreationDate>
        </Bucket>
    </Buckets>
</ListAllMyBucketsResult>`;

    return xmlResponse(xml);
});

// CreateBucket (PUT / or PUT /{bucket})
s3App.put("/", async (c) => {
    const auth = await authenticateS3Request(c.req.raw);
    if (!auth) {
        return xmlResponse(s3ErrorXml("AccessDenied", "Access Denied"), 403);
    }
    return new Response(null, { status: 200 });
});

async function handleListObjects(c: any): Promise<Response> {
    const auth = await authenticateS3Request(c.req.raw);
    if (!auth) {
        return xmlResponse(s3ErrorXml("AccessDenied", "Access Denied"), 403);
    }

    const url = new URL(c.req.raw.url);
    const isV2 = url.searchParams.get("list-type") === "2";
    const prefixParam = url.searchParams.get("prefix") || "";
    const delimiter = url.searchParams.get("delimiter") || undefined;
    const maxKeys = parseInt(url.searchParams.get("max-keys") || "1000", 10);
    const cursor =
        url.searchParams.get(isV2 ? "continuation-token" : "marker") ||
        undefined;

    // Resolve user-scoped prefix
    let r2Prefix = `${auth.userId}/`;
    if (prefixParam) {
        let cleanPrefix = prefixParam.replace(/^\/+/, "");
        if (
            cleanPrefix.startsWith("media/") ||
            cleanPrefix.startsWith("pollinations/")
        ) {
            cleanPrefix = cleanPrefix.replace(/^(media|pollinations)\//, "");
        }
        if (cleanPrefix.startsWith(`${auth.userId}/`)) {
            cleanPrefix = cleanPrefix.substring(auth.userId.length + 1);
        }
        r2Prefix = `${auth.userId}/${cleanPrefix}`;
    }

    const listResult = await c.env.MEDIA_BUCKET.list({
        prefix: r2Prefix,
        delimiter,
        limit: maxKeys,
        cursor,
    });

    const objectsXml = listResult.objects
        .map((obj: R2Object) => {
            // Strip user ID prefix for S3 response display
            const displayKey = obj.key.substring(auth.userId.length + 1);
            return `<Contents>
        <Key>${displayKey}</Key>
        <LastModified>${obj.uploaded.toISOString()}</LastModified>
        <ETag>"${obj.httpEtag || obj.etag}"</ETag>
        <Size>${obj.size}</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>`;
        })
        .join("\n");

    const prefixesXml = (listResult.delimitedPrefixes || [])
        .map((p: string) => {
            const displayPrefix = p.substring(auth.userId.length + 1);
            return `<CommonPrefixes><Prefix>${displayPrefix}</Prefix></CommonPrefixes>`;
        })
        .join("\n");

    const xml = isV2
        ? `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>media</Name>
    <Prefix>${prefixParam}</Prefix>
    <KeyCount>${listResult.objects.length}</KeyCount>
    <MaxKeys>${maxKeys}</MaxKeys>
    <IsTruncated>${listResult.truncated}</IsTruncated>
    ${listResult.truncated && listResult.cursor ? `<NextContinuationToken>${listResult.cursor}</NextContinuationToken>` : ""}
    ${objectsXml}
    ${prefixesXml}
</ListBucketResult>`
        : `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>media</Name>
    <Prefix>${prefixParam}</Prefix>
    <Marker>${cursor || ""}</Marker>
    <MaxKeys>${maxKeys}</MaxKeys>
    <IsTruncated>${listResult.truncated}</IsTruncated>
    ${listResult.truncated && listResult.cursor ? `<NextMarker>${listResult.cursor}</NextMarker>` : ""}
    ${objectsXml}
    ${prefixesXml}
</ListBucketResult>`;

    return xmlResponse(xml);
}

// S3 GET / HEAD / PUT / DELETE / Multipart handler for paths
s3App.on(["GET", "HEAD", "PUT", "DELETE", "POST"], "/*", async (c) => {
    const req = c.req.raw;
    const url = new URL(req.url);
    const method = req.method;

    // Check if ListObjects on bucket path (e.g. GET /media?list-type=2)
    if (
        method === "GET" &&
        (url.searchParams.has("list-type") || url.searchParams.has("prefix"))
    ) {
        return handleListObjects(c);
    }

    const path = url.pathname;
    const auth = await authenticateS3Request(req);

    // GET / HEAD requests
    if (method === "GET" || method === "HEAD") {
        // Resolve target object key
        // Format can be /{userId}/public/... or /{userId}/private/... or /media/{userId}/...
        // For public objects, unauthenticated read is allowed if resolved
        let targetKey: string | null = null;
        let isPublic = false;

        // Try extracting user and path from URL if unauthenticated
        const pathSegments = path.replace(/^\/+/, "").split("/");
        let segIdx = 0;
        if (pathSegments[0] === "media" || pathSegments[0] === "pollinations") {
            segIdx = 1;
        }

        const potentialUserId = pathSegments[segIdx];
        const visibility = pathSegments[segIdx + 1];

        if (visibility === "public") {
            isPublic = true;
            targetKey = pathSegments.slice(segIdx).join("/");
        } else if (auth) {
            const resolved = resolveObjectKey(path, auth.userId);
            if (resolved) {
                targetKey = resolved.key;
                isPublic = resolved.isPublic;
            }
        }

        if (!targetKey) {
            return xmlResponse(
                s3ErrorXml("AccessDenied", "Access Denied"),
                403,
            );
        }

        // Handle GET / HEAD
        if (method === "HEAD") {
            const object = await c.env.MEDIA_BUCKET.head(targetKey);
            if (!object) {
                return new Response(null, { status: 404 });
            }
            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("Content-Length", object.size.toString());
            headers.set("ETag", `"${object.httpEtag || object.etag}"`);
            headers.set("Last-Modified", object.uploaded.toUTCString());
            return new Response(null, { status: 200, headers });
        } else {
            // GET object with Range & conditional headers support
            const rangeHeader = req.headers.get("range") || undefined;
            const object = await c.env.MEDIA_BUCKET.get(targetKey, {
                range: req.headers,
                onlyIf: req.headers,
            });

            if (!object) {
                return xmlResponse(
                    s3ErrorXml(
                        "NoSuchKey",
                        "The specified key does not exist.",
                        targetKey,
                    ),
                    404,
                );
            }

            const headers = new Headers();
            headers.set(
                "Content-Type",
                object.httpMetadata?.contentType || "application/octet-stream",
            );
            headers.set("ETag", `"${object.httpEtag || object.etag}"`);
            headers.set("Last-Modified", object.uploaded.toUTCString());

            if ("range" in object && object.range) {
                headers.set(
                    "Content-Range",
                    `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`,
                );
                headers.set("Content-Length", object.range.length.toString());
                return new Response((object as R2ObjectBody).body, {
                    status: 206,
                    headers,
                });
            }

            headers.set("Content-Length", object.size.toString());
            return new Response((object as R2ObjectBody).body, {
                status: 200,
                headers,
            });
        }
    }

    // Write operations require authentication and secret (sk_) key
    if (!auth) {
        return xmlResponse(s3ErrorXml("AccessDenied", "Access Denied"), 403);
    }

    if (auth.keyType !== "secret") {
        return xmlResponse(
            s3ErrorXml(
                "AccessDenied",
                "Write operations require a secret (sk_) API key",
            ),
            403,
        );
    }

    const resolved = resolveObjectKey(path, auth.userId);
    if (!resolved) {
        return xmlResponse(
            s3ErrorXml(
                "InvalidRequest",
                "Invalid key path prefix. Must be public/ or private/",
            ),
            400,
        );
    }

    const targetKey = resolved.key;

    // DELETE Object
    if (method === "DELETE") {
        const uploadId = url.searchParams.get("uploadId");
        if (uploadId) {
            // AbortMultipartUpload
            const multipart = c.env.MEDIA_BUCKET.resumeMultipartUpload(
                targetKey,
                uploadId,
            );
            await multipart.abort();
            return new Response(null, { status: 204 });
        }

        await c.env.MEDIA_BUCKET.delete(targetKey);
        return new Response(null, { status: 204 });
    }

    // POST Operations (Multipart Create / Complete)
    if (method === "POST") {
        if (url.searchParams.has("uploads")) {
            // CreateMultipartUpload
            const contentType =
                req.headers.get("content-type") || "application/octet-stream";
            const multipart = await c.env.MEDIA_BUCKET.createMultipartUpload(
                targetKey,
                {
                    httpMetadata: { contentType },
                },
            );

            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>media</Bucket>
    <Key>${resolved.rawPath}</Key>
    <UploadId>${multipart.uploadId}</UploadId>
</InitiateMultipartUploadResult>`;
            return xmlResponse(xml);
        }

        const uploadId = url.searchParams.get("uploadId");
        if (uploadId) {
            // CompleteMultipartUpload
            const bodyText = await req.text();
            const partMatches = Array.from(
                bodyText.matchAll(
                    /<Part>\s*<PartNumber>(\d+)<\/PartNumber>\s*<ETag>([^<]+)<\/ETag>\s*<\/Part>/g,
                ),
            );
            const parts: R2UploadedPart[] = partMatches.map((m) => ({
                partNumber: parseInt(m[1], 10),
                etag: m[2].replace(/"/g, ""),
            }));

            const multipart = c.env.MEDIA_BUCKET.resumeMultipartUpload(
                targetKey,
                uploadId,
            );
            const object = await multipart.complete(parts);

            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Location>https://${DOMAIN}/${targetKey}</Location>
    <Bucket>media</Bucket>
    <Key>${resolved.rawPath}</Key>
    <ETag>"${object.httpEtag || object.etag}"</ETag>
</CompleteMultipartUploadResult>`;
            return xmlResponse(xml);
        }
    }

    // PUT Operations (PutObject / UploadPart)
    if (method === "PUT") {
        const uploadId = url.searchParams.get("uploadId");
        const partNumberStr = url.searchParams.get("partNumber");

        let bodyStream = req.body;
        if (!bodyStream) {
            return xmlResponse(
                s3ErrorXml("InvalidRequest", "Missing request body"),
                400,
            );
        }

        // Check if stream is aws-chunked framed
        const encoding = req.headers.get("content-encoding") || "";
        if (encoding.includes("aws-chunked")) {
            bodyStream = decodeAwsChunkedBody(bodyStream);
        }

        if (uploadId && partNumberStr) {
            // UploadPart
            const partNumber = parseInt(partNumberStr, 10);
            const multipart = c.env.MEDIA_BUCKET.resumeMultipartUpload(
                targetKey,
                uploadId,
            );
            const part = await multipart.uploadPart(partNumber, bodyStream);

            return new Response(null, {
                status: 200,
                headers: {
                    ETag: `"${part.etag}"`,
                },
            });
        } else {
            // PutObject
            const contentType =
                req.headers.get("content-type") || "application/octet-stream";
            const object = await c.env.MEDIA_BUCKET.put(targetKey, bodyStream, {
                httpMetadata: {
                    contentType,
                },
                customMetadata: {
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: auth.userId,
                    keyType: auth.keyType,
                },
            });

            return new Response(null, {
                status: 200,
                headers: {
                    ETag: `"${object.httpEtag || object.etag}"`,
                },
            });
        }
    }

    return xmlResponse(
        s3ErrorXml("MethodNotAllowed", "Method Not Allowed"),
        405,
    );
});
