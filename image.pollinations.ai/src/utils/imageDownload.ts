import { fileTypeFromBuffer } from "file-type";
import { validateImageUrl } from "./ssrfGuard.ts";

/**
 * Download image from URL and convert to base64 with correct MIME type detection.
 * Uses magic bytes instead of trusting content-type header (fixes Telegram CDN issues).
 *
 * Hardened against SSRF, oversized payloads, and slow-loris hosts:
 *   - URL is validated by `validateImageUrl` (scheme + private IP block)
 *   - Redirects are followed manually with re-validation per hop
 *   - Response is streamed and aborted past `MAX_BYTES`
 *   - A `FETCH_TIMEOUT_MS` ceiling is applied via AbortSignal
 *
 * `data:` URIs are decoded inline without any network access.
 */

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 30_000;

const DATA_URI_RE = /^data:([^;,]*)?(?:;([^,]*))?,([\s\S]*)$/i;

function decodeDataUri(uri: string): { base64: string; mimeType: string } {
    const m = uri.match(DATA_URI_RE);
    if (!m) throw new Error("Invalid data: URI");
    const mimeType = m[1] || "application/octet-stream";
    const isBase64 = (m[2] || "").toLowerCase().includes("base64");
    const base64 = isBase64
        ? m[3].replace(/\s+/g, "")
        : Buffer.from(decodeURIComponent(m[3])).toString("base64");
    return { base64, mimeType };
}

async function fetchWithRedirectGuard(
    initialUrl: URL,
    signal: AbortSignal,
): Promise<Response> {
    let current = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetch(current.toString(), {
            redirect: "manual",
            signal,
        });
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) return res;
            if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
            const next = new URL(location, current);
            const validated = await validateImageUrl(next.toString());
            if (validated.kind !== "http")
                throw new Error("Redirect to non-http URL blocked");
            current = validated.url;
            continue;
        }
        return res;
    }
    throw new Error("Too many redirects");
}

async function readBodyWithLimit(response: Response): Promise<Buffer> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_BYTES) {
            try {
                await reader.cancel();
            } catch {
                /* ignore */
            }
            throw new Error(
                `Image exceeds maximum size of ${MAX_BYTES} bytes`,
            );
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}

export async function downloadImageAsBase64(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
    const validated = await validateImageUrl(imageUrl);
    if (validated.kind === "data") return decodeDataUri(validated.raw);

    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

    const response = await fetchWithRedirectGuard(validated.url, combinedSignal);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
    }

    const buffer = await readBodyWithLimit(response);
    const base64 = buffer.toString("base64");
    const fileType = await fileTypeFromBuffer(buffer);
    const mimeType = fileType?.mime || "image/jpeg";
    return { base64, mimeType };
}
