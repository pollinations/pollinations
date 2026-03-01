import debug from "debug";
import fetch from "node-fetch";
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
    url: string;

    constructor(message: string, statusCode: number, url: string) {
        super(message);
        this.name = "ImageFetchError";
        this.status = statusCode;
        this.url = url;
    }
}

/** Max image size: 20MB */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

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

async function fetchImageAsBase64(url: string): Promise<string> {
    try {
        log(`Fetching image: ${url}`);
        const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
            headers: { "User-Agent": "Pollinations/1.0" },
        });

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

            throw new ImageFetchError(errorMessage, response.status, url);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.startsWith("image/")) {
            throw new ImageFetchError(
                `Invalid content type for ${url}: received ${contentType}, expected image/*. Please provide a direct link to an image file.`,
                400,
                url,
            );
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
            throw new ImageFetchError(
                `Image too large: ${contentLength} bytes (max ${MAX_IMAGE_SIZE} bytes). Please use a smaller image.`,
                400,
                url,
            );
        }

        const mimeType = detectMimeType(url, contentType);
        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
            throw new ImageFetchError(
                `Image too large: ${arrayBuffer.byteLength} bytes (max ${MAX_IMAGE_SIZE} bytes). Please use a smaller image.`,
                400,
                url,
            );
        }

        const base64 = Buffer.from(arrayBuffer).toString("base64");
        log(`Converted image to base64: ${mimeType}, ${base64.length} chars`);
        return `data:${mimeType};base64,${base64}`;
    } catch (thrown: unknown) {
        if (thrown instanceof ImageFetchError) {
            errorLog(`Image fetch error for ${url}: ${thrown.message}`);
            throw thrown;
        }

        const error = thrown as {
            message?: string;
            name?: string;
            code?: string;
        };
        let errorMessage = `Failed to fetch image from ${url}: ${error.message}`;

        if (error.name === "AbortError") {
            errorMessage = `Image fetch timeout for ${url}: The server took too long to respond (>30 seconds). Please try a faster image host.`;
        } else if (error.code === "ENOTFOUND") {
            errorMessage = `Invalid image URL ${url}: The domain could not be found. Please check the URL is correct.`;
        } else if (error.code === "ECONNREFUSED") {
            errorMessage = `Cannot connect to image server ${url}: Connection refused. The server may be down.`;
        }

        errorLog(`Failed to fetch image ${url}: ${error.message}`);
        throw new ImageFetchError(errorMessage, 400, url);
    }
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

async function processContentPart(part: ContentPart): Promise<ContentPart> {
    if (part.type !== "image_url" || !part.image_url?.url) {
        return part;
    }

    if (!needsConversion(part.image_url.url)) {
        return part;
    }

    const dataUrl = await fetchImageAsBase64(part.image_url.url);
    return {
        ...part,
        image_url: { ...part.image_url, url: dataUrl },
    };
}

async function processMessageContent(
    content: ContentPart[],
): Promise<ContentPart[]> {
    return Promise.all(content.map(processContentPart));
}

/**
 * Creates a transform that converts HTTP image URLs to base64 data URLs
 * for Vertex AI and Bedrock compatibility. These providers require base64
 * inline data rather than HTTP URLs.
 */
export function createImageUrlToBase64Transform(): TransformFn {
    return async (messages, options) => {
        const config = options?.modelConfig as
            | Record<string, unknown>
            | undefined;
        const provider = config?.provider as string | undefined;
        const targets = (config?.targets || []) as Array<
            Record<string, unknown>
        >;
        const hasBase64Target = targets.some(
            (t) => t.provider === "vertex-ai" || t.provider === "bedrock",
        );

        if (
            provider !== "vertex-ai" &&
            provider !== "bedrock" &&
            !hasBase64Target
        ) {
            return { messages, options };
        }

        const providerInfo = provider
            ? provider
            : `fallback[${targets.map((t) => t.provider).join(", ")}]`;
        log(`Processing messages for ${providerInfo} image URL conversion`);

        const processedMessages = await Promise.all(
            messages.map(async (message) => {
                if (!message.content || typeof message.content === "string") {
                    return message;
                }

                const processedContent = await processMessageContent(
                    message.content as ContentPart[],
                );
                return { ...message, content: processedContent };
            }),
        );

        log("Image URL conversion complete");
        return { messages: processedMessages, options };
    };
}
