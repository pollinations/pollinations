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
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Validate content type
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.startsWith("image/")) {
            throw new Error(
                `Invalid content type: ${contentType}, expected image/*`,
            );
        }

        // Validate size from header if available
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
            throw new Error(
                `Image too large: ${contentLength} bytes (max ${MAX_IMAGE_SIZE})`,
            );
        }

        const mimeType = detectMimeType(url, contentType);
        const arrayBuffer = await response.arrayBuffer();

        // Validate actual size
        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
            throw new Error(
                `Image too large: ${arrayBuffer.byteLength} bytes (max ${MAX_IMAGE_SIZE})`,
            );
        }

        const base64 = Buffer.from(arrayBuffer).toString("base64");

        log(`Converted image to base64: ${mimeType}, ${base64.length} chars`);
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        errorLog(`Failed to fetch image ${url}: ${error.message}`);
        throw error;
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
        const provider = options?.modelConfig?.provider;
        const needsBase64 = provider === "vertex-ai" || provider === "bedrock";
        if (!needsBase64) {
            return { messages, options };
        }

        log(`Processing messages for ${provider} image URL conversion`);

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
