import { WorkerEntrypoint } from "cloudflare:workers";

const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

type MediaUploadEnv = {
    MEDIA_BUCKET: R2Bucket;
    MAX_FILE_SIZE: string;
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
    env: MediaUploadEnv,
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
    await env.MEDIA_BUCKET.put(id, body, {
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

    return {
        id,
        url: `https://media.pollinations.ai/${id}`,
        contentType,
        size: input.size,
    };
}

export class MediaUpload extends WorkerEntrypoint<MediaUploadEnv> {
    upload(
        body: ReadableStream<Uint8Array>,
        input: UnlistedMediaUpload,
    ): Promise<UnlistedMediaUploadResult> {
        return uploadUnlistedMedia(this.env, body, input);
    }
}
