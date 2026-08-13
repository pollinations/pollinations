import type { ImageInputErrorCode } from "@shared/error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import { HttpError } from "./image/httpError.ts";
import { readResponseBytes } from "./utils/response-bytes.ts";

/**
 * A user-supplied image we could not use.
 *
 * Always 400: the caller gave us a URL we cannot work with, so the failure is
 * theirs, not an upstream's. An image host's own status is kept in
 * `upstreamStatus` for observability only — surfacing it as ours would make a
 * dead link return 404 and a rate-limiting image CDN return 429.
 *
 * Extends HttpError so the image and 3d funnels catch it by the check they
 * already make, while the text funnel reads it structurally as a ServiceError.
 */
export class UserImageError extends HttpError {
    readonly errorCode: ImageInputErrorCode;
    upstreamStatus?: number;
    requestUrl?: URL;

    constructor(
        message: string,
        errorCode: ImageInputErrorCode,
        requestUrl?: URL,
        upstreamStatus?: number,
    ) {
        super(message, 400, { validation: true }, undefined, errorCode);
        this.name = "UserImageError";
        this.errorCode = errorCode;
        this.requestUrl = requestUrl;
        this.upstreamStatus = upstreamStatus;
    }
}

/** Max bytes we will read for a single user-supplied image: 20MB. */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const BLOCKED_HOSTNAMES = /^localhost$/i;

/**
 * Blocks the hosts a user-supplied URL must never reach: loopback, any literal
 * IP, and anything containing a colon (an IPv6 literal, which covers ::1 and
 * the unique-local range without enumerating them).
 *
 * Deliberately blunt. A bare IP is never a legitimate way to reference a public
 * image, and allowing one opens link-local metadata endpoints — so the whole
 * literal-address space is refused rather than filtered range by range.
 */
function isBlockedImageHost(hostname: string): boolean {
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

/**
 * The one gate every user-supplied image URL passes before we fetch it, so a
 * URL one path refuses can never be reachable through the other instead.
 */
function assertAllowedImageUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new UserImageError(
            `Invalid image URL ${value}: expected a valid HTTP(S) URL.`,
            "invalid_image_url",
        );
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new UserImageError(
            `Invalid image URL ${value}: only HTTP(S) image URLs can be fetched.`,
            "invalid_image_url",
        );
    }

    if (url.username || url.password || isBlockedImageHost(url.hostname)) {
        throw new UserImageError(
            `Invalid image URL ${value}: private or credentialed image URLs are not allowed.`,
            "invalid_image_url",
        );
    }

    return url;
}

/** The image host's own status, phrased as something the caller can act on. */
function unreachableMessage(url: string, response: Response): string {
    const base = `Failed to fetch image from ${url}: HTTP ${response.status} ${response.statusText || "Unknown error"}`;
    switch (response.status) {
        case 401:
        case 403:
            return `${base}. The image requires authentication or is forbidden. Please use a publicly accessible image URL.`;
        case 404:
            return `${base}. The image was not found. Please check the URL is correct.`;
        case 429:
            return `${base}. The image server is rate limiting requests. Please try a different image source or wait before retrying.`;
        default:
            return base;
    }
}

function transportMessage(url: string, error: Error): string {
    const message = error.message || "Unknown error";
    if (error instanceof TypeError) {
        if (/dns|domain|not found|resolve/i.test(message)) {
            return `Invalid image URL ${url}: The domain could not be found. Please check the URL is correct.`;
        }
        if (/connect|refused|unreachable/i.test(message)) {
            return `Cannot connect to image server ${url}: Connection refused. The server may be down.`;
        }
    }
    return `Failed to fetch image from ${url}: ${message}`;
}

export type FetchUserImageOptions = {
    /** Bytes still available for this image. Defaults to the per-image cap. */
    maxBytes?: number;
    /**
     * `"manual"` refuses redirects outright. A redirect is followed to a host
     * the URL guard never saw, so the strict paths decline rather than
     * re-validate a moving target.
     */
    redirect?: RequestRedirect;
    signal?: AbortSignal;
};

/**
 * The media type to forward upstream: whatever it says it is.
 *
 * This only labels the bytes for the provider, so it makes no judgement about
 * them. A declared type is relayed as-is even when it is not an image type —
 * whether the provider can use it is the provider's answer to give, and it
 * gives a better one than a guess from here would.
 *
 * The bytes are only consulted when nothing was declared, since something has
 * to be sent: `inlineData` and the `data:` URI format both require a type. If
 * that finds nothing either there is genuinely nothing to relay, and the
 * remaining option would be to invent one — which is what the old `image/jpeg`
 * default did.
 */
function resolveMimeType(
    bytes: Uint8Array,
    declared: string | null,
): string | null {
    const claimed = declared?.split(";")[0].trim().toLowerCase();
    return claimed || detectImageMimeType(bytes);
}

/**
 * Decodes a `data:` image, which is what a multipart upload becomes before it
 * reaches here (see the `/v1/images/edits` form parser). The bytes are already
 * in hand, so only the size cap and the media type apply.
 */
function decodeDataUri(imageUrl: string, maxBytes: number): Uint8Array {
    const comma = imageUrl.indexOf(",");
    const header = comma < 0 ? "" : imageUrl.slice(0, comma);
    if (comma < 0 || !/;base64$/i.test(header)) {
        throw new UserImageError(
            "Invalid image data URI: expected base64-encoded image data.",
            "invalid_image_url",
        );
    }

    let binary: string;
    try {
        binary = atob(imageUrl.slice(comma + 1));
    } catch {
        throw new UserImageError(
            "Invalid image data URI: the base64 payload could not be decoded.",
            "invalid_image_url",
        );
    }

    if (binary.length > maxBytes) {
        throw new UserImageError(
            `Image too large: ${binary.length} bytes (max ${maxBytes} bytes remaining). Please use a smaller image.`,
            "image_too_large",
        );
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Fetches one user-supplied image: guarded, size-capped, and labelled with a
 * media type to forward. Takes either a remote URL or a `data:` URI, so an
 * uploaded file and a linked one are held to the same limits.
 *
 * The type is only ever forwarded — it names the bytes for `inlineData`, a data
 * URI, or a multipart part — so this resolves one rather than judging whether
 * the image is usable. See `resolveMimeType`.
 */
export async function fetchUserImage(
    imageUrl: string,
    options: FetchUserImageOptions = {},
): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const { maxBytes = MAX_IMAGE_SIZE, redirect, signal } = options;

    if (imageUrl.startsWith("data:")) {
        const bytes = decodeDataUri(
            imageUrl,
            Math.min(MAX_IMAGE_SIZE, maxBytes),
        );
        const mimeType = resolveMimeType(
            bytes,
            imageUrl.slice(5, imageUrl.indexOf(",")).replace(/;base64$/i, ""),
        );
        if (!mimeType) {
            throw new UserImageError(
                "Invalid image data URI: it declares no media type and its payload is not a recognised image.",
                "unsupported_image_media_type",
            );
        }
        return { bytes, mimeType };
    }

    const url = assertAllowedImageUrl(imageUrl);

    let response: Response;
    try {
        response = await fetch(url, {
            ...(redirect && { redirect }),
            headers: { "User-Agent": "Pollinations/1.0" },
            ...(signal && { signal }),
        });
    } catch (thrown) {
        const error =
            thrown instanceof Error ? thrown : new Error(String(thrown));
        throw new UserImageError(
            transportMessage(imageUrl, error),
            "failed_to_download_image",
            url,
        );
    }

    if (
        redirect === "manual" &&
        response.status >= 300 &&
        response.status < 400
    ) {
        throw new UserImageError(
            `Image URL ${imageUrl} redirects. Please provide a direct public image URL.`,
            "invalid_image_url",
            url,
            response.status,
        );
    }

    if (!response.ok) {
        throw new UserImageError(
            unreachableMessage(imageUrl, response),
            "failed_to_download_image",
            url,
            response.status,
        );
    }

    const cap = Math.min(MAX_IMAGE_SIZE, maxBytes);
    if (cap <= 0) {
        throw new UserImageError(
            `Too many image bytes in request (max ${MAX_IMAGE_SIZE} bytes).`,
            "image_too_large",
        );
    }

    let bytes: Uint8Array;
    try {
        bytes = await readResponseBytes(
            response,
            cap,
            (total) =>
                new UserImageError(
                    `Image too large: ${total} bytes (max ${cap} bytes remaining). Please use a smaller image.`,
                    "image_too_large",
                ),
        );
    } catch (thrown) {
        if (thrown instanceof UserImageError) throw thrown;
        const error =
            thrown instanceof Error ? thrown : new Error(String(thrown));
        // The body never arrived. The media type is still unknown at this
        // point, so blaming it would send callers looking at an image we never
        // actually read.
        throw new UserImageError(
            `Failed to read image ${imageUrl}: ${error.message}`,
            "failed_to_download_image",
            url,
        );
    }

    const mimeType = resolveMimeType(
        bytes,
        response.headers.get("content-type"),
    );
    if (!mimeType) {
        throw new UserImageError(
            `Unsupported image format from ${imageUrl}: the response carries no content-type and its body is not a recognised image.`,
            "unsupported_image_media_type",
            url,
        );
    }

    return { bytes, mimeType };
}
