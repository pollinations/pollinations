import debug from "debug";
import type { TransformFn } from "../types.js";

const log = debug("pollinations:transforms:imageUrl");
const errorLog = debug("pollinations:transforms:imageUrl:error");

const MIME_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
};

class ImageFetchError extends Error {
    status: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "ImageFetchError";
        this.status = statusCode;
    }
}

/** Max image size: 20MB */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = MAX_IMAGE_SIZE;
const MAX_IMAGES_PER_REQUEST = 8;
const IMAGE_FETCH_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTNAMES = /^localhost$/i;

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

function assertAllowedImageUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new ImageFetchError(
            `Invalid image URL ${value}: expected a valid HTTP(S) URL.`,
            400,
        );
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ImageFetchError(
            `Invalid image URL ${value}: only HTTP(S) image URLs can be fetched.`,
            400,
        );
    }

    if (url.username || url.password || isBlockedImageHost(url.hostname)) {
        throw new ImageFetchError(
            `Invalid image URL ${value}: private or credentialed image URLs are not allowed.`,
            400,
        );
    }

    return url;
}

function detectMimeType(url: string, contentType: string | null): string {
    if (contentType?.startsWith("image/")) {
        return contentType.split(";")[0].trim();
    }

    try {
        const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
        if (ext && ext in MIME_TYPES) {
            return MIME_TYPES[ext];
        }
    } catch {
        // Invalid URL, skip
    }

    errorLog(`Could not detect MIME type for ${url}, defaulting to image/jpeg`);
    return "image/jpeg";
}

async function readImageBytes(
    response: Response,
    maxBytes: number,
): Promise<ArrayBuffer> {
    if (maxBytes <= 0) {
        throw new ImageFetchError(
            `Too many image bytes in request (max ${MAX_TOTAL_IMAGE_BYTES} bytes).`,
            400,
        );
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
            throw new ImageFetchError(
                `Image too large: ${arrayBuffer.byteLength} bytes (max ${maxBytes} bytes remaining). Please use a smaller image.`,
                400,
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
                throw new ImageFetchError(
                    `Image too large: ${total} bytes (max ${maxBytes} bytes remaining). Please use a smaller image.`,
                    400,
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

async function fetchImageAsBase64(
    url: string,
    maxBytes: number,
): Promise<{ dataUrl: string; byteLength: number }> {
    try {
        const validatedUrl = assertAllowedImageUrl(url);
        log(`Fetching image: ${validatedUrl.origin}${validatedUrl.pathname}`);
        const response = await fetch(validatedUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
            headers: { "User-Agent": "Pollinations/1.0" },
        });

        if (response.status >= 300 && response.status < 400) {
            throw new ImageFetchError(
                `Image URL ${url} redirects. Please provide a direct public image URL.`,
                400,
            );
        }

        if (!response.ok) {
            const base = `Failed to fetch image from ${url}: HTTP ${response.status} ${response.statusText || "Unknown error"}`;
            let errorMessage: string;

            switch (response.status) {
                case 401:
                case 403:
                    errorMessage = `${base}. The image requires authentication or is forbidden. Please use a publicly accessible image URL.`;
                    break;
                case 404:
                    errorMessage = `${base}. The image was not found. Please check the URL is correct.`;
                    break;
                case 429:
                    errorMessage = `${base}. The image server is rate limiting requests. Please try a different image source or wait before retrying.`;
                    break;
                default:
                    errorMessage = base;
            }

            throw new ImageFetchError(errorMessage, response.status);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.startsWith("image/")) {
            throw new ImageFetchError(
                `Invalid content type for ${url}: received ${contentType}, expected image/*. Please provide a direct link to an image file.`,
                400,
            );
        }

        const contentLength = response.headers.get("content-length");
        const maxAllowedBytes = Math.min(MAX_IMAGE_SIZE, maxBytes);
        if (contentLength && parseInt(contentLength, 10) > maxAllowedBytes) {
            throw new ImageFetchError(
                `Image too large: ${contentLength} bytes (max ${maxAllowedBytes} bytes remaining). Please use a smaller image.`,
                400,
            );
        }

        const mimeType = detectMimeType(url, contentType);
        const arrayBuffer = await readImageBytes(response, maxAllowedBytes);

        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
            throw new ImageFetchError(
                `Image too large: ${arrayBuffer.byteLength} bytes (max ${MAX_IMAGE_SIZE} bytes). Please use a smaller image.`,
                400,
            );
        }

        const base64 = arrayBufferToBase64(arrayBuffer);
        log(`Converted image to base64: ${mimeType}, ${base64.length} chars`);
        return {
            dataUrl: `data:${mimeType};base64,${base64}`,
            byteLength: arrayBuffer.byteLength,
        };
    } catch (thrown: unknown) {
        if (thrown instanceof ImageFetchError) {
            errorLog(`Image fetch error for ${url}: ${thrown.message}`);
            throw thrown;
        }

        const error = thrown as {
            message?: string;
            name?: string;
        };
        const message = error.message || "Unknown error";
        let errorMessage = `Failed to fetch image from ${url}: ${message}`;

        if (error.name === "AbortError") {
            errorMessage = `Image fetch timeout for ${url}: The server took too long to respond (>30 seconds). Please try a faster image host.`;
        } else if (error instanceof TypeError) {
            if (/dns|domain|not found|resolve/i.test(message)) {
                errorMessage = `Invalid image URL ${url}: The domain could not be found. Please check the URL is correct.`;
            } else if (/connect|refused|unreachable/i.test(message)) {
                errorMessage = `Cannot connect to image server ${url}: Connection refused. The server may be down.`;
            }
        }

        errorLog(`Failed to fetch image ${url}: ${message}`);
        throw new ImageFetchError(errorMessage, 400);
    }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
}

/**
 * Returns true if the URL is an HTTP(S) URL that needs base64 conversion.
 * Data URLs and GCS URLs are already supported natively.
 */
function needsConversion(url: string | undefined): boolean {
    if (!url) return false;
    if (url.startsWith("data:")) return false;
    if (url.startsWith("gs://")) return false;
    return url.startsWith("http://") || url.startsWith("https://");
}

interface ContentPart {
    type: string;
    image_url?: { url: string; [key: string]: unknown };
    [key: string]: unknown;
}

type ImageConversionContext = { imageCount: number; totalBytes: number };

async function processContentPart(
    part: ContentPart,
    context: ImageConversionContext,
): Promise<ContentPart> {
    if (part.type !== "image_url" || !part.image_url?.url) {
        return part;
    }

    if (!needsConversion(part.image_url.url)) {
        return part;
    }

    context.imageCount += 1;
    if (context.imageCount > MAX_IMAGES_PER_REQUEST) {
        throw new ImageFetchError(
            `Too many image URLs in request (max ${MAX_IMAGES_PER_REQUEST}).`,
            400,
        );
    }

    const remainingBytes = MAX_TOTAL_IMAGE_BYTES - context.totalBytes;
    const { dataUrl, byteLength } = await fetchImageAsBase64(
        part.image_url.url,
        remainingBytes,
    );
    context.totalBytes += byteLength;
    return {
        ...part,
        image_url: { ...part.image_url, url: dataUrl },
    };
}

async function processMessageContent(
    content: ContentPart[],
    context: ImageConversionContext,
): Promise<ContentPart[]> {
    const processed: ContentPart[] = [];
    for (const part of content) {
        processed.push(await processContentPart(part, context));
    }
    return processed;
}

/**
 * Creates a transform that converts HTTP image URLs to base64 data URLs
 * for providers/models that require inline image data.
 */
export function createImageUrlToBase64Transform(): TransformFn {
    return async (messages, options) => {
        const config = options?.modelConfig as
            | Record<string, unknown>
            | undefined;
        const provider = config?.provider as string | undefined;
        const requiresBase64ImageUrls =
            config?.requiresBase64ImageUrls === true;
        const targets = (config?.targets || []) as Array<
            Record<string, unknown>
        >;
        const hasBase64Target = targets.some(
            (t) => t.provider === "vertex-ai" || t.provider === "bedrock",
        );

        if (
            provider !== "vertex-ai" &&
            provider !== "bedrock" &&
            !requiresBase64ImageUrls &&
            !hasBase64Target
        ) {
            return { messages, options };
        }

        const providerInfo = provider
            ? provider
            : `fallback[${targets.map((t) => t.provider).join(", ")}]`;
        log(`Processing messages for ${providerInfo} image URL conversion`);

        const context: ImageConversionContext = {
            imageCount: 0,
            totalBytes: 0,
        };
        const processedMessages = [];
        for (const message of messages) {
            if (!message.content || typeof message.content === "string") {
                processedMessages.push(message);
                continue;
            }

            const processedContent = await processMessageContent(
                message.content as ContentPart[],
                context,
            );
            processedMessages.push({ ...message, content: processedContent });
        }

        log("Image URL conversion complete");
        return { messages: processedMessages, options };
    };
}
