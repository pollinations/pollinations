import { HTTPException } from "hono/http-exception";

const BLOCKED_HOSTNAMES = /^localhost$/i;
export const MAX_REMOTE_MEDIA_BYTES = 20 * 1024 * 1024;

export function badRemoteMediaRequest(message: string): never {
    throw new HTTPException(400, { message });
}

export function assertAllowedRemoteMediaUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        badRemoteMediaRequest(
            `Invalid media URL ${value}: expected a valid HTTP(S) URL.`,
        );
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        badRemoteMediaRequest(
            `Invalid media URL ${value}: only HTTP(S) media URLs can be fetched.`,
        );
    }

    if (
        url.username ||
        url.password ||
        isBlockedRemoteMediaHost(url.hostname)
    ) {
        badRemoteMediaRequest(
            `Invalid media URL ${value}: private or credentialed media URLs are not allowed.`,
        );
    }

    return url;
}

function isBlockedRemoteMediaHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "");
    const normalized = host.toLowerCase();
    if (
        BLOCKED_HOSTNAMES.test(normalized) ||
        normalized.endsWith(".localhost")
    ) {
        return true;
    }

    if (normalized.includes(":")) {
        return true;
    }

    const parts = normalized.split(".").map(Number);
    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return false;
    }

    return true;
}

export function assertNoRemoteMediaRedirect(url: string, response: Response) {
    if (response.status >= 300 && response.status < 400) {
        badRemoteMediaRequest(
            `Media URL ${url} redirects. Please provide a direct public media URL.`,
        );
    }
}

export function assertRemoteMediaContentLength(
    url: string,
    response: Response,
    maxBytes = MAX_REMOTE_MEDIA_BYTES,
) {
    const contentLength = response.headers.get("content-length");
    if (!contentLength) return;
    const byteLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(byteLength) && byteLength > maxBytes) {
        badRemoteMediaRequest(
            `Media too large for ${url}: ${byteLength} bytes (max ${maxBytes} bytes).`,
        );
    }
}

export async function readRemoteMediaBytes(
    response: Response,
    maxBytes = MAX_REMOTE_MEDIA_BYTES,
): Promise<ArrayBuffer> {
    const reader = response.body?.getReader();
    if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
            badRemoteMediaRequest(
                `Media too large: ${arrayBuffer.byteLength} bytes (max ${maxBytes} bytes).`,
            );
        }
        return arrayBuffer;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                badRemoteMediaRequest(
                    `Media too large: ${total} bytes (max ${maxBytes} bytes).`,
                );
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes.buffer;
}
