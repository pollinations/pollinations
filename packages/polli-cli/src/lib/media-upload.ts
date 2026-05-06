import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { MEDIA_URL } from "./config.js";

const MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

export interface MediaUploadResponse {
    id: string;
    url: string;
    contentType: string;
    size: number;
    duplicate: boolean;
}

/** Resolve the MIME type for a local file path, falling back to octet-stream. */
export function detectMimeType(path: string): string {
    return (
        MIME_BY_EXT[extname(path).toLowerCase()] || "application/octet-stream"
    );
}

/**
 * Upload a local file to media.pollinations.ai and return the full response.
 *
 * Throws with a readable message on:
 *   - missing file (caller should validate first if it wants a different code path)
 *   - 401 (invalid/expired API key)
 *   - 413 (over the 10 MB media cap, enforced server-side)
 *   - any other non-2xx response
 *
 * Used by `polli upload` (the standalone upload command) and by
 * `polli image --image <path>` to auto-host a local reference image before
 * dispatching to gen for image-to-image generation.
 */
export async function uploadLocalFile(
    path: string,
    apiKey: string,
): Promise<MediaUploadResponse> {
    if (!existsSync(path)) {
        throw new Error(`File not found: ${path}`);
    }

    const form = new FormData();
    form.append(
        "file",
        new Blob([readFileSync(path)], { type: detectMimeType(path) }),
        basename(path),
    );

    const res = await fetch(`${MEDIA_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Surface the most common cases with friendlier framing; fall through
        // to a generic message otherwise.
        if (res.status === 401) {
            throw new Error(
                "Unauthorized. Run `polli auth login` or pass --key <pk_or_sk>.",
            );
        }
        if (res.status === 413) {
            throw new Error(
                "File too large for media.pollinations.ai (10 MB cap). Resize or compress before uploading.",
            );
        }
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }

    return (await res.json()) as MediaUploadResponse;
}
