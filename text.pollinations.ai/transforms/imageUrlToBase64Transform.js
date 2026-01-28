import debug from "debug";
import fetch from "node-fetch";

const log = debug("pollinations:transforms:imageUrl");
const errorLog = debug("pollinations:transforms:imageUrl:error");

// MIME type mapping from file extensions
const MIME_TYPES = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
};

/**
 * Custom error class for image fetch failures
 * Preserves the original HTTP status and provides clear error context
 */
class ImageFetchError extends Error {
    constructor(message, statusCode, url) {
        super(message);
        this.name = "ImageFetchError";
        this.status = statusCode;  // Use 'status' to match existing error handling
        this.url = url;
        // Mark this as a client error (bad input) - the image URL they provided is problematic
        this.isClientError = true;
    }
}

/**
 * Detect MIME type from URL or content-type header
 */
function detectMimeType(url, contentType) {
    // First try content-type header
    if (contentType?.startsWith("image/")) {
        return contentType.split(";")[0].trim();
    }

    // Fallback: try to detect from URL extension
    try {
        const urlObj = new URL(url);
        const ext = urlObj.pathname.split(".").pop()?.toLowerCase();
        if (ext && Object.hasOwn(MIME_TYPES, ext)) {
            return MIME_TYPES[ext];
        }
    } catch {
        // Invalid URL, skip
    }

    // Default to jpeg if can't detect - log warning as this may cause issues
    errorLog(`Could not detect MIME type for ${url}, defaulting to image/jpeg`);
    return "image/jpeg";
}

// Max image size: 20MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/**
 * Fetch image and convert to base64 data URL
 */
async function fetchImageAsBase64(url) {
    try {
        log(`Fetching image: ${url}`);
        const response = await fetch(url, {
            signal: AbortSignal.timeout(30000), // 30 second timeout
            headers: {
                "User-Agent": "Pollinations/1.0",
            },
        });

        if (!response.ok) {
            // Preserve the original status code and provide context
            const statusText = response.statusText || "Unknown error";
            let errorMessage = `Failed to fetch image from ${url}: HTTP ${response.status} ${statusText}`;

            // Add helpful context for common errors
            if (response.status === 429) {
                errorMessage += ". The image server is rate limiting requests. Please try a different image source or wait before retrying.";
            } else if (response.status === 403 || response.status === 401) {
                errorMessage += ". The image requires authentication or is forbidden. Please use a publicly accessible image URL.";
            } else if (response.status === 404) {
                errorMessage += ". The image was not found. Please check the URL is correct.";
            }

            throw new ImageFetchError(errorMessage, response.status, url);
        }

        // Validate content type
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.startsWith("image/")) {
            throw new ImageFetchError(
                `Invalid content type for ${url}: received ${contentType}, expected image/*. Please provide a direct link to an image file.`,
                400,
                url
            );
        }

        // Validate size from header if available
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
            throw new ImageFetchError(
                `Image too large: ${contentLength} bytes (max ${MAX_IMAGE_SIZE} bytes). Please use a smaller image.`,
                400,
                url
            );
        }

        const mimeType = detectMimeType(url, contentType);
        const arrayBuffer = await response.arrayBuffer();

        // Validate actual size
        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
            throw new ImageFetchError(
                `Image too large: ${arrayBuffer.byteLength} bytes (max ${MAX_IMAGE_SIZE} bytes). Please use a smaller image.`,
                400,
                url
            );
        }

        const base64 = Buffer.from(arrayBuffer).toString("base64");

        log(`Converted image to base64: ${mimeType}, ${base64.length} chars`);
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        // If it's already our custom error, re-throw it
        if (error instanceof ImageFetchError) {
            errorLog(`Image fetch error for ${url}: ${error.message}`);
            throw error;
        }

        // Handle other errors (network timeouts, DNS failures, etc.)
        let errorMessage = `Failed to fetch image from ${url}: ${error.message}`;

        if (error.name === 'AbortError') {
            errorMessage = `Image fetch timeout for ${url}: The server took too long to respond (>30 seconds). Please try a faster image host.`;
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = `Invalid image URL ${url}: The domain could not be found. Please check the URL is correct.`;
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = `Cannot connect to image server ${url}: Connection refused. The server may be down.`;
        }

        errorLog(`Failed to fetch image ${url}: ${error.message}`);
        // These are client errors - they provided a bad URL
        throw new ImageFetchError(errorMessage, 400, url);
    }
}

/**
 * Check if URL is an HTTP(S) URL that needs conversion
 */
function isHttpUrl(url) {
    return url && (url.startsWith("http://") || url.startsWith("https://"));
}

/**
 * Check if URL is already a data URL or GCS URL (no conversion needed)
 */
function needsConversion(url) {
    if (!url) return false;
    // Already base64 data URL
    if (url.startsWith("data:")) return false;
    // Google Cloud Storage URL (supported natively by Vertex AI)
    if (url.startsWith("gs://")) return false;
    // HTTP URLs need conversion
    return isHttpUrl(url);
}

/**
 * Process a single content part, converting image URLs if needed
 */
async function processContentPart(part) {
    if (part.type !== "image_url" || !part.image_url?.url) {
        return part;
    }

    const url = part.image_url.url;

    if (!needsConversion(url)) {
        return part;
    }

    // Let errors propagate - gives users clear error messages instead of silent 500s
    const dataUrl = await fetchImageAsBase64(url);
    return {
        ...part,
        image_url: {
            ...part.image_url,
            url: dataUrl,
        },
    };
}

/**
 * Process message content, handling both string and array formats
 */
async function processMessageContent(content) {
    if (!Array.isArray(content)) {
        return content;
    }

    // Let errors propagate for clear error messages
    return await Promise.all(content.map(processContentPart));
}

/**
 * Transform function that converts HTTP image URLs to base64 data URLs
 * for Vertex AI and Bedrock compatibility.
 *
 * Vertex AI requires either:
 * - inlineData (base64 with mimeType)
 * - fileData (gs:// URLs with mimeType)
 *
 * Bedrock/Claude requires base64 data URLs for images.
 *
 * HTTP URLs are not directly supported and cause errors.
 *
 * @returns {Function} Transform function
 */
export function createImageUrlToBase64Transform() {
    return async (messages, options) => {
        // Apply to Vertex AI and Bedrock providers (both require base64 images)
        const config = options?.modelConfig;
        const provider = config?.provider;

        // For fallback configs, check if any target uses vertex-ai or bedrock
        const targets = config?.targets || [];
        const hasBase64Target = targets.some(
            (t) => t.provider === "vertex-ai" || t.provider === "bedrock",
        );

        const needsBase64 =
            provider === "vertex-ai" ||
            provider === "bedrock" ||
            hasBase64Target;
        if (!needsBase64) {
            return { messages, options };
        }

        const providerInfo = provider
            ? provider
            : `fallback[${targets.map((t) => t.provider).join(", ")}]`;
        log(`Processing messages for ${providerInfo} image URL conversion`);

        // Process all messages in parallel
        const processedMessages = await Promise.all(
            messages.map(async (message) => {
                if (!message.content || typeof message.content === "string") {
                    return message;
                }

                const processedContent = await processMessageContent(
                    message.content,
                );
                return {
                    ...message,
                    content: processedContent,
                };
            }),
        );

        log("Image URL conversion complete");
        return { messages: processedMessages, options };
    };
}

export { ImageFetchError };
