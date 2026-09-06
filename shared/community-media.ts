import { normalizeCommunityAssetUrl } from "./community-endpoint-urls.ts";
import { COMMUNITY_ENDPOINT_TIMEOUT_MS } from "./community-endpoints.ts";
import { UpstreamError } from "./error.ts";
import { readResponseBytes } from "./response-bytes.ts";

export const MAX_COMMUNITY_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_COMMUNITY_VIDEO_BYTES = 20 * 1024 * 1024;
// A JSON envelope carrying a 20 MB base64 clip is at most ~28 MB; leave a
// small amount of room for the envelope while still bounding provider output.
export const MAX_COMMUNITY_MEDIA_RESPONSE_BYTES =
    Math.ceil((MAX_COMMUNITY_VIDEO_BYTES * 4) / 3) + 64 * 1024;

/**
 * Pull the first usable image out of an OpenAI images response: inline base64
 * when present, otherwise the URL it points at, fetched under the shared
 * timeout and size cap.
 *
 * Returns null when the body carries no usable image, so each caller can
 * phrase that in its own words. A URL that is unsafe, unreachable, or oversized
 * throws UpstreamError(502) — the gen funnel renders that status directly, and the
 * enter probe flattens it to a 400 with the same message.
 */
export async function firstCommunityImageBytes(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Uint8Array | null> {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        return null;
    }
    for (const image of body.data) {
        if (!image || typeof image !== "object") continue;
        if (
            "b64_json" in image &&
            typeof image.b64_json === "string" &&
            image.b64_json.length > 0
        ) {
            return decodeCommunityBase64(image.b64_json);
        }
        if (
            "url" in image &&
            typeof image.url === "string" &&
            image.url.length > 0
        ) {
            return fetchCommunityImageBytes(image.url, endpointBaseUrl);
        }
    }
    return null;
}

/**
 * Read one completed clip from the synchronous community video contract.
 * Publishers return OpenAI-images-style `data` with either `b64_json` or a
 * downloadable URL. Billing uses the duration accepted by Pollinations, not
 * publisher-provided metadata.
 */
export async function firstCommunityVideoBytes(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Uint8Array | null> {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        return null;
    }
    for (const video of body.data) {
        if (!video || typeof video !== "object") continue;
        if (
            "b64_json" in video &&
            typeof video.b64_json === "string" &&
            video.b64_json.length > 0
        ) {
            // Base64 expands bytes by roughly 4/3. Reject oversized inline
            // payloads before decoding so an untrusted endpoint cannot force a
            // much larger temporary allocation inside the Worker.
            if (
                video.b64_json.length >
                Math.ceil((MAX_COMMUNITY_VIDEO_BYTES * 4) / 3) + 128
            ) {
                throw UpstreamError.fromProvider(502, {
                    message: "Endpoint video is larger than 20 MB",
                });
            }
            const bytes = decodeCommunityBase64(video.b64_json);
            if (!bytes) continue;
            if (bytes.byteLength > MAX_COMMUNITY_VIDEO_BYTES) {
                throw UpstreamError.fromProvider(502, {
                    message: "Endpoint video is larger than 20 MB",
                });
            }
            return bytes;
        }
        if (
            "url" in video &&
            typeof video.url === "string" &&
            video.url.length > 0
        ) {
            return fetchCommunityVideoBytes(video.url, endpointBaseUrl);
        }
    }
    return null;
}

export function decodeCommunityBase64(value: string): Uint8Array | null {
    try {
        const encoded = value
            .replace(/^data:[^,]+,/, "")
            .replace(/\s/g, "")
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const decoded = atob(encoded);
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    } catch {
        return null;
    }
}

async function fetchCommunityImageBytes(
    value: string,
    endpointBaseUrl: string,
): Promise<Uint8Array> {
    const url = safeCommunityAssetUrl(value, endpointBaseUrl, "image");
    let response: Response;
    try {
        // The URL is validated against https + the private-host blocklist
        // above; following redirects would let the endpoint bounce us to an
        // unvalidated destination.
        response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw UpstreamError.fromProvider(502, {
            message: "Endpoint image URL timed out or could not connect",
            responseBody: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
            }),
            requestUrl: new URL(url),
        });
    }
    if (!response.ok) {
        throw new UpstreamError(502, {
            message: `Endpoint image URL responded ${response.status}`,
            upstreamStatus: response.status,
            responseBody: await response.text().catch(() => undefined),
            requestUrl: new URL(url),
        });
    }
    return readResponseBytes(response, MAX_COMMUNITY_IMAGE_BYTES, () =>
        UpstreamError.fromProvider(502, {
            message: "Endpoint image is larger than 20 MB",
        }),
    );
}

async function fetchCommunityVideoBytes(
    value: string,
    endpointBaseUrl: string,
): Promise<Uint8Array> {
    const url = safeCommunityAssetUrl(value, endpointBaseUrl, "video");
    let response: Response;
    try {
        response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw UpstreamError.fromProvider(502, {
            message: "Endpoint video URL timed out or could not connect",
            responseBody: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
            }),
            requestUrl: new URL(url),
        });
    }
    if (!response.ok) {
        throw new UpstreamError(502, {
            message: `Endpoint video URL responded ${response.status}`,
            upstreamStatus: response.status,
            responseBody: await response.text().catch(() => undefined),
            requestUrl: new URL(url),
        });
    }
    try {
        return await readResponseBytes(
            response,
            MAX_COMMUNITY_VIDEO_BYTES,
            () =>
                UpstreamError.fromProvider(502, {
                    message: "Endpoint video is larger than 20 MB",
                }),
        );
    } catch (error) {
        if (error instanceof UpstreamError) throw error;
        throw UpstreamError.fromProvider(502, {
            message: "Endpoint video could not be read",
            responseBody: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
            }),
        });
    }
}

function safeCommunityAssetUrl(
    value: string,
    endpointBaseUrl: string,
    kind: "image" | "video",
): string {
    try {
        return normalizeCommunityAssetUrl(value, endpointBaseUrl);
    } catch {
        throw UpstreamError.fromProvider(502, {
            message: `Endpoint returned an unsafe ${kind} URL`,
        });
    }
}
