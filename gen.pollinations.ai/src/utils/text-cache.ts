/**
 * Text caching utilities for gen.pollinations.ai
 * Copied from enter.pollinations.ai with minimal changes.
 */

import stableStringify from "fast-json-stable-stringify";
import type { Context } from "hono";

const EXCLUDED_PARAMS = ["key", "no-cache"];

export async function generateCacheKey(
    request: Request,
    bodyText?: string,
): Promise<string> {
    const url = new URL(request.url);
    const filteredParams = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
            filteredParams.append(key, value);
        }
    }

    const normalizedMethod = request.method === "HEAD" ? "GET" : request.method;
    const parts = [normalizedMethod, url.pathname, filteredParams.toString()];

    if (bodyText && (request.method === "POST" || request.method === "PUT")) {
        try {
            const bodyObj = JSON.parse(bodyText);
            const filteredBody: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(bodyObj)) {
                if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
                    filteredBody[key] = value;
                }
            }
            parts.push(stableStringify(filteredBody));
        } catch {
            parts.push(bodyText);
        }
    }

    const text = parts.join("|");
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function prepareMetadata(response: Response): Record<string, string> {
    return {
        response_content_type: response.headers.get("content-type") || "",
        status: response.status.toString(),
        statusText: response.statusText,
        cachedAt: new Date().toISOString(),
    };
}

export async function getCachedResponse(
    c: Context,
    key: string,
): Promise<Response | null> {
    try {
        const cachedObject = await (c.env as any).TEXT_BUCKET.get(key);
        if (!cachedObject) return null;

        const metadata = cachedObject.customMetadata || {};
        const headers = new Headers();
        if (metadata.response_content_type) {
            headers.set("content-type", metadata.response_content_type);
        }
        headers.set("X-Cache", "HIT");
        headers.set("X-Cache-Key", key.substring(0, 16));
        headers.set(
            "X-Cache-Date",
            metadata.cachedAt || cachedObject.uploaded.toISOString(),
        );
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(cachedObject.body, {
            status: parseInt(metadata.status || "200", 10),
            statusText: metadata.statusText || "OK",
            headers,
        });
    } catch {
        return null;
    }
}

export function createCaptureStream(
    c: Context,
    cacheKey: string,
    response: Response,
): TransformStream<Uint8Array, Uint8Array> {
    let chunks: Uint8Array[] = [];
    let totalSize = 0;

    return new TransformStream({
        transform(chunk, controller) {
            chunks.push(chunk.slice());
            totalSize += chunk.byteLength;
            controller.enqueue(chunk);
        },
        flush(_controller) {
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        const completeResponse = new Uint8Array(totalSize);
                        let offset = 0;
                        for (const chunk of chunks) {
                            completeResponse.set(chunk, offset);
                            offset += chunk.byteLength;
                        }
                        const metadata = prepareMetadata(response);
                        await (c.env as any).TEXT_BUCKET.put(
                            cacheKey,
                            completeResponse,
                            { customMetadata: metadata },
                        );
                        chunks = [];
                    } catch {
                        // Caching failure is non-fatal
                    }
                })(),
            );
        },
    });
}
