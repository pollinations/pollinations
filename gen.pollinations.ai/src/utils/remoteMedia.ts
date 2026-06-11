import { HTTPException } from "hono/http-exception";

// Cap remote media so a user-supplied URL can't make the worker buffer an
// unbounded download (DoS / amplification).
export const MAX_REMOTE_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_REMOTE_MEDIA_REDIRECTS = 3;

export function badRemoteMediaRequest(message: string): never {
    throw new HTTPException(400, { message });
}

// Basic hygiene for user-supplied media URLs. We run on Cloudflare Workers,
// where loopback/localhost and the cloud metadata endpoint aren't reachable
// via fetch, and there's no connect-time DNS re-resolution to pin against — so
// an exhaustive private-IP blocklist buys little and is bypassable anyway
// (decimal/hex/short-form literals). Reject the obvious footguns — non-HTTP(S)
// schemes, credentialed URLs, localhost — and rely on bounded manual redirects
// plus the size cap below for the rest.
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

    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
        url.username ||
        url.password ||
        host === "localhost" ||
        host.endsWith(".localhost")
    ) {
        badRemoteMediaRequest(
            `Invalid media URL ${value}: credentialed or localhost media URLs are not allowed.`,
        );
    }

    return url;
}

function isRedirect(response: Response): boolean {
    return response.status >= 300 && response.status < 400;
}

export async function fetchRemoteMedia(
    url: string,
    opts: { signal?: AbortSignal; maxRedirects?: number } = {},
): Promise<Response> {
    let currentUrl = assertAllowedRemoteMediaUrl(url);
    const maxRedirects = opts.maxRedirects ?? MAX_REMOTE_MEDIA_REDIRECTS;

    for (
        let redirectCount = 0;
        redirectCount <= maxRedirects;
        redirectCount++
    ) {
        const response = await fetch(currentUrl, {
            redirect: "manual",
            signal: opts.signal,
        });
        if (!isRedirect(response)) return response;

        const location = response.headers.get("location");
        if (!location) {
            badRemoteMediaRequest(
                `Media URL ${currentUrl.toString()} redirects without a Location header.`,
            );
        }
        if (redirectCount === maxRedirects) {
            badRemoteMediaRequest(
                `Media URL ${url} exceeded ${maxRedirects} redirects.`,
            );
        }

        currentUrl = assertAllowedRemoteMediaUrl(
            new URL(location, currentUrl).toString(),
        );
    }

    badRemoteMediaRequest(
        `Media URL ${url} exceeded ${maxRedirects} redirects.`,
    );
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
