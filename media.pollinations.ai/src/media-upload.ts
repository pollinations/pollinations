import { WorkerEntrypoint } from "cloudflare:workers";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";

const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;

type MediaStorageEnv = {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
    DB: D1Database;
};

export type UnlistedMediaUpload = {
    contentType: string;
    fileName?: string;
    size: number;
};

export type UnlistedMediaUploadResult = {
    id: string;
    url: string;
    contentType: string;
    size: number;
};

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

    const id = crypto.randomUUID();
    const contentType = input.contentType || "application/octet-stream";
    const upload = new FixedLengthStream(input.size);
    body.pipeTo(upload.writable).catch(() => undefined);
    try {
        await env.MEDIA_BUCKET.put(id, upload.readable, {
            httpMetadata: {
                contentType,
                cacheControl: IMMUTABLE_CACHE_CONTROL,
            },
            customMetadata: {
                uploadedAt: new Date().toISOString(),
                originalName: input.fileName?.slice(0, 253) || "",
                uploadedBy: "pollinations-service",
                keyType: "service",
            },
        });
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
    const body = refreshR2ObjectTtl(
        env.MEDIA_BUCKET,
        id,
        object as R2ObjectBody,
        (promise) => ctx.waitUntil(promise),
        (error) => console.error("Media TTL refresh failed", error),
    );
    return new Response(body, { headers });
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

    /**
     * Record that `userId` has this generation in their private list
     * (surfaced via GET /media/mine on the public API). Called by other
     * services over this RPC binding, both on a fresh generation write and
     * on a cache hit — a cache hit means someone else's request already
     * produced this exact file, and the current requester should still see
     * it in their own list. Looks up the object's own contentType/size via
     * R2 rather than trusting the caller for them, since this entrypoint is
     * reachable cross-service with no request-level validation of its own.
     * A silent no-op if the object no longer exists (expired, or the id was
     * never written): callers use this best-effort and shouldn't have to
     * special-case a missing object on every cache hit.
     *
     * Uses raw D1 statements rather than catalog.ts's drizzle helpers: this
     * file is imported directly (not just over a service binding) by
     * gen.pollinations.ai's tests as a fast in-process double for the RPC
     * binding, and media.pollinations.ai keeps its own, separately-versioned
     * drizzle-orm install — a drizzle import here would pull two
     * incompatible copies of drizzle-orm's classes into that cross-package
     * build. Column names below must stay in sync with
     * shared/db/media-catalog.ts.
     */
    async linkToUser(id: string, userId: string): Promise<void> {
        const object = await this.env.MEDIA_BUCKET.head(id);
        if (!object) return;
        const contentType =
            object.httpMetadata?.contentType || "application/octet-stream";
        const createdAt = Math.floor(Date.now() / 1000);
        await this.env.DB.batch([
            this.env.DB.prepare(
                `INSERT INTO media_item (id, owner_user_id, app_key_id, content_type, size, source, created_at)
                 VALUES (?, NULL, NULL, ?, ?, 'generation', ?)
                 ON CONFLICT (id) DO NOTHING`,
            ).bind(id, contentType, object.size, createdAt),
            this.env.DB.prepare(
                `INSERT INTO media_user_link (item_id, user_id, created_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT (user_id, item_id) DO NOTHING`,
            ).bind(id, userId, createdAt),
        ]);
    }
}
