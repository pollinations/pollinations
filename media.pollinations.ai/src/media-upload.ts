import { WorkerEntrypoint } from "cloudflare:workers";
import type { MediaExpiry } from "@shared/db/media-storage.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import {
    DEFAULT_R2_TTL_REFRESH_AGE_MS,
    R2_LIFECYCLE_TTL_MS,
    refreshR2ObjectTtl,
    rewriteR2Object,
} from "@shared/r2-storage.ts";

const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;

type MediaStorageEnv = {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
    DB: D1Database;
};

export type UnlistedMediaUpload = {
    id?: string;
    contentType: string;
    fileName?: string;
    size: number;
    uploadedBy?: string;
    keyType?: string;
    // The account that may delete the file (DELETE /media/:id).
    ownerUserId?: string;
    // A paid upload's expiry mode, which tells GET whether to renew it.
    expiresAfter?: MediaExpiry;
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
                    originalName: input.fileName?.slice(0, 253) || "",
                    uploadedBy: input.uploadedBy || "pollinations-service",
                    keyType: input.keyType || "service",
                    ...(input.ownerUserId && {
                        ownerUserId: input.ownerUserId,
                    }),
                    ...(input.expiresAfter && {
                        expiresAfter: input.expiresAfter,
                    }),
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

/** The same file response is served to browsers and to the generation cache. */
export async function readMedia(
    env: MediaStorageEnv,
    id: string,
    ctx: Pick<ExecutionContext, "waitUntil">,
    method = "GET",
): Promise<Response | null> {
    const object = await (method === "HEAD"
        ? env.MEDIA_BUCKET.head(id)
        : env.MEDIA_BUCKET.get(id));
    if (!object) return null;

    const headers = new Headers({
        "Content-Type":
            object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control":
            object.httpMetadata?.cacheControl || IMMUTABLE_CACHE_CONTROL,
        "X-Content-Id": id,
        "X-Content-Size": object.size.toString(),
        Link: `<https://media.pollinations.ai/${id}>; rel="enclosure"`,
    });
    for (const [key, value] of Object.entries(object.customMetadata ?? {})) {
        if (key.startsWith("header_")) headers.set(key.slice(7), value);
    }
    const originalName = object.customMetadata?.originalName;
    if (originalName) {
        headers.set(
            "Content-Disposition",
            `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`,
        );
    }
    if (!("body" in object)) {
        headers.set("Content-Length", object.size.toString());
        return new Response(null, { headers });
    }
    const expiresAfter = object.customMetadata?.expiresAfter;
    if (expiresAfter === undefined) {
        // Free storage: generated media, uploads with keys that have no
        // account, and files uploaded before storage was paid.
        const body = refreshR2ObjectTtl(
            env.MEDIA_BUCKET,
            id,
            object as R2ObjectBody,
            (promise) => ctx.waitUntil(promise),
            (error) => console.error("Media TTL refresh failed", error),
        );
        return new Response(body, { headers });
    }
    const now = Date.now();
    if (
        expiresAfter === "last_active_at" &&
        now - object.uploaded.getTime() >= DEFAULT_R2_TTL_REFRESH_AGE_MS
    ) {
        // Fetched in its last 15 paid days: gen's cron renews it for 30 days
        // from now and charges the key, or lets its paid time end.
        // Plain SQL: media's drizzle is older than the schema's.
        ctx.waitUntil(
            env.DB.prepare(
                `UPDATE media_storage SET renew_to = ?1
                WHERE id = ?2 AND expires_after = 'last_active_at'
                    AND renew_to IS NULL AND paid_until > ?3`,
            )
                .bind(
                    Math.floor((now + R2_LIFECYCLE_TTL_MS) / 1000),
                    id,
                    Math.floor(now / 1000),
                )
                .run()
                .catch((error) =>
                    console.error("Media renewal mark failed", error),
                ),
        );
    }
    return new Response((object as R2ObjectBody).body, { headers });
}

export class MediaUpload extends WorkerEntrypoint<MediaStorageEnv> {
    upload(
        body: ReadableStream<Uint8Array>,
        input: UnlistedMediaUpload,
    ): Promise<UnlistedMediaUploadResult> {
        return uploadUnlistedMedia(this.env, body, input);
    }

    get(id: string): Promise<Response | null> {
        return readMedia(this.env, id, this.ctx);
    }

    async has(id: string): Promise<boolean> {
        return (await this.env.MEDIA_BUCKET.head(id)) !== null;
    }

    /**
     * Rewrites a file that R2 would delete before `until`, which restarts its
     * 30 days. False when the file is gone.
     */
    async refresh(id: string, until: Date): Promise<boolean> {
        const head = await this.env.MEDIA_BUCKET.head(id);
        if (!head) return false;
        if (head.uploaded.getTime() + R2_LIFECYCLE_TTL_MS >= until.getTime()) {
            return true;
        }
        const object = await this.env.MEDIA_BUCKET.get(id);
        if (!object) return false;
        const stored = await rewriteR2Object(
            this.env.MEDIA_BUCKET,
            id,
            object,
            object.body,
        );
        return stored !== null;
    }

    /** Deletes a file whose paid time is over. */
    async delete(id: string): Promise<void> {
        await this.env.MEDIA_BUCKET.delete(id);
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
