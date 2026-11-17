import { WorkerEntrypoint } from "cloudflare:workers";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import {
    DEFAULT_R2_TTL_REFRESH_AGE_MS,
    refreshR2ObjectTtl,
} from "@shared/r2-storage.ts";

const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;

// R2 rejects a put with more than 8,192 bytes of object metadata, so every
// upload path stores at most 253 characters of the filename. Counting code
// points keeps an emoji at the cut whole; 506 UTF-16 units always hold 253
// of them, so a huge name is never split into a huge array.
export function storedFileName(fileName: string | undefined): string {
    return Array.from((fileName ?? "").slice(0, 506))
        .slice(0, 253)
        .join("");
}

type MediaStorageEnv = {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
};

export type UnlistedMediaUpload = {
    id?: string;
    contentType: string;
    fileName?: string;
    size: number;
    uploadedBy?: string;
    keyType?: string;
    keyId?: string;
    userId?: string;
};

export type UnlistedMediaUploadResult = {
    id: string;
    url: string;
    contentType: string;
    size: number;
};

const FILENAME_EXT_PARAM = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;\s]+)/i;

/**
 * Original filename of a raw upload. Header values cannot carry CJK or emoji
 * as-is, so clients send the UTF-8 name as an RFC 8187 `filename*` parameter
 * of `Content-Disposition`. Plain `X-File-Name` stays the fallback.
 */
export function rawUploadFileName(headers: Headers): string | undefined {
    const encoded = headers
        .get("content-disposition")
        ?.match(FILENAME_EXT_PARAM)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded);
        } catch {
            // Malformed percent-encoding: use X-File-Name instead.
        }
    }
    return headers.get("x-file-name") ?? undefined;
}

export async function uploadUnlistedMedia(
    env: MediaStorageEnv,
    body: ReadableStream<Uint8Array>,
    input: UnlistedMediaUpload,
): Promise<UnlistedMediaUploadResult> {
    const maxSize = parseInt(env.MAX_FILE_SIZE, 10) || DEFAULT_MAX_SIZE;
    if (!Number.isSafeInteger(input.size) || input.size <= 0) {
        throw new Error("Media size must be a positive integer");
    }
    if (input.size > maxSize) {
        throw new Error(`Media exceeds ${maxSize} bytes`);
    }

    if (input.id !== undefined && !/^[a-f0-9]{64}$/.test(input.id)) {
        throw new Error("Invalid media ID");
    }
    const id = input.id ?? crypto.randomUUID();
    const contentType = input.contentType || "application/octet-stream";
    if (input.id && (await env.MEDIA_BUCKET.head(id))) {
        return {
            id,
            url: `https://media.pollinations.ai/${id}`,
            contentType,
            size: input.size,
        };
    }
    const upload = new FixedLengthStream(input.size);
    const pipe = body.pipeTo(upload.writable);
    try {
        await Promise.all([
            env.MEDIA_BUCKET.put(id, upload.readable, {
                httpMetadata: {
                    contentType,
                    cacheControl: IMMUTABLE_CACHE_CONTROL,
                },
                customMetadata: {
                    uploadedAt: new Date().toISOString(),
                    originalName: storedFileName(input.fileName),
                    uploadedBy: input.uploadedBy || "pollinations-service",
                    keyType: input.keyType || "service",
                    keyId: input.keyId ?? "",
                    userId: input.userId ?? "",
                },
            }),
            pipe,
        ]);
    } catch (error) {
        throw new Error(
            `R2 upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }

    return {
        id,
        url: `https://media.pollinations.ai/${id}`,
        contentType,
        size: input.size,
    };
}

// media.pollinations.ai is same-site with the rest of pollinations.ai, so a
// file must never run script there. Only images, audio and video open in the
// browser; SVG and other XML, HTML and everything else download. Browsers
// read "image/png,text/html" as its last type, so lists never open inline.
function opensInline(contentType: string): boolean {
    const essence = contentType.split(";")[0].trim().toLowerCase();
    return (
        !contentType.includes(",") &&
        /^(image|audio|video)\//.test(essence) &&
        !essence.endsWith("xml")
    );
}

/** The same file response is served to browsers and to the generation cache. */
export async function readMedia(
    env: MediaStorageEnv,
    id: string,
    ctx: Pick<ExecutionContext, "waitUntil">,
    method = "GET",
    rangeHeader?: string,
): Promise<Response | null> {
    const isHead = method === "HEAD";

    // Range requests need the full size before fetching bytes, so read the
    // metadata first and ask R2 for only the wanted slice. Plain GETs keep
    // their single-operation path.
    if (rangeHeader) {
        const meta = await env.MEDIA_BUCKET.head(id);
        if (!meta) return null;
        const headers = mediaHeaders(meta, id);
        const range = requestedByteRange(rangeHeader, meta.size);
        if (range === "unsatisfiable") {
            headers.set("Content-Range", `bytes */${meta.size}`);
            headers.set("Content-Length", "0");
            return new Response(null, { status: 416, headers });
        }
        if (range) {
            headers.set(
                "Content-Range",
                `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`,
            );
            headers.set("Content-Length", range.length.toString());
            if (isHead) return new Response(null, { status: 206, headers });
            const ranged = await env.MEDIA_BUCKET.get(id, {
                range: { offset: range.offset, length: range.length },
            });
            if (!ranged) return null;
            // A partial read still counts as viewing the file: refresh an aged
            // object in the background so the retention window keeps moving.
            if (
                Date.now() - meta.uploaded.getTime() >=
                DEFAULT_R2_TTL_REFRESH_AGE_MS
            ) {
                ctx.waitUntil(refreshAgedMedia(env, id));
            }
            return new Response(ranged.body, { status: 206, headers });
        }
    }

    const object = await (isHead
        ? env.MEDIA_BUCKET.head(id)
        : env.MEDIA_BUCKET.get(id));
    if (!object) return null;

    const headers = mediaHeaders(object, id);
    if (!("body" in object)) {
        headers.set("Content-Length", object.size.toString());
        return new Response(null, { headers });
    }
    const body = refreshR2ObjectTtl(
        env.MEDIA_BUCKET,
        id,
        object as R2ObjectBody,
        (promise) => ctx.waitUntil(promise),
        (error) => console.error("Media TTL refresh failed", error),
    );
    return new Response(body, { headers });
}

/**
 * One byte range from a Range header. "unsatisfiable" is a well-formed range
 * that starts past the end; undefined means the header belongs to a case the
 * RFC allows ignoring (absent, malformed, or several ranges).
 */
function requestedByteRange(
    header: string | undefined,
    size: number,
): { offset: number; length: number } | "unsatisfiable" | undefined {
    const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
    if (!match) return undefined;
    const [, startText, endText] = match;
    if (startText === "" && endText === "") return undefined;

    if (startText === "") {
        const suffix = Number(endText);
        if (!Number.isSafeInteger(suffix)) return undefined;
        if (suffix === 0 || size === 0) return "unsatisfiable";
        const length = Math.min(suffix, size);
        return { offset: size - length, length };
    }

    const start = Number(startText);
    if (!Number.isSafeInteger(start)) return undefined;
    if (start >= size) return "unsatisfiable";
    if (endText === "") return { offset: start, length: size - start };

    const end = Number(endText);
    if (!Number.isSafeInteger(end) || end < start) return undefined;
    return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

function mediaHeaders(object: R2Object, id: string): Headers {
    const contentType =
        object.httpMetadata?.contentType || "application/octet-stream";
    const disposition = opensInline(contentType) ? "inline" : "attachment";
    const originalName = object.customMetadata?.originalName;
    const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control":
            object.httpMetadata?.cacheControl || IMMUTABLE_CACHE_CONTROL,
        "Accept-Ranges": "bytes",
        "X-Content-Id": id,
        "X-Content-Size": object.size.toString(),
        Link: `<https://media.pollinations.ai/${id}>; rel="enclosure"`,
        "Content-Disposition": originalName
            ? `${disposition}; filename*=UTF-8''${encodeURIComponent(originalName)}`
            : disposition,
    });
    // Generated files replay the headers gen chose for them. Only the trusted
    // put() below writes header_* metadata; uploads never do.
    for (const [key, value] of Object.entries(object.customMetadata ?? {})) {
        if (key.startsWith("header_")) headers.set(key.slice(7), value);
    }
    // Set last: no stored header may let a file run script.
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    return headers;
}

/** Rewrite an aged object from a full read so its lifecycle age resets. */
async function refreshAgedMedia(
    env: MediaStorageEnv,
    id: string,
): Promise<void> {
    const object = await env.MEDIA_BUCKET.get(id);
    if (!object) return;
    const upload = new FixedLengthStream(object.size);
    await Promise.all([
        env.MEDIA_BUCKET.put(id, upload.readable, {
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
            storageClass: object.storageClass,
            // A concurrent delete or replacement must win, or the refresh
            // would resurrect an object no API can delete any more.
            onlyIf: { etagMatches: object.etag },
        }),
        object.body.pipeTo(upload.writable),
    ]);
}

export class MediaUpload extends WorkerEntrypoint<MediaStorageEnv> {
    upload(
        body: ReadableStream<Uint8Array>,
        input: UnlistedMediaUpload,
    ): Promise<UnlistedMediaUploadResult> {
        return uploadUnlistedMedia(this.env, body, input);
    }

    get(id: string, rangeHeader?: string): Promise<Response | null> {
        return readMedia(this.env, id, this.ctx, "GET", rangeHeader);
    }

    async has(id: string): Promise<boolean> {
        return (await this.env.MEDIA_BUCKET.head(id)) !== null;
    }

    /** Trusted generation write; the caller selects headers safe for public replay. */
    async put(id: string, response: Response): Promise<void> {
        if (!/^[a-f0-9]{64}$/.test(id))
            throw new Error("Invalid generation ID");
        const body = await response.arrayBuffer();
        if (!body.byteLength)
            throw new Error("Refusing to store empty generated media");
        const metadata: Record<string, string> = {
            uploadedAt: new Date().toISOString(),
            keyType: "generation",
        };
        for (const [name, value] of response.headers) {
            if (name !== "content-type") {
                metadata[`header_${name}`] = value;
            }
        }
        await this.env.MEDIA_BUCKET.put(id, body, {
            httpMetadata: {
                contentType:
                    response.headers.get("content-type") ||
                    "application/octet-stream",
                cacheControl: IMMUTABLE_CACHE_CONTROL,
            },
            customMetadata: metadata,
        });
    }
}
