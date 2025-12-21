/**
 * Core Utility functions for the Pollinations MCP Server
 */

import { getAuthHeaders, getAuthQueryParam } from "./authUtils.js";

// API Base URL - the unified gen.pollinations.ai endpoint
export const API_BASE_URL = "https://gen.pollinations.ai";

/**
 * Creates a tool definition object with schema and handler
 *
 * @param {Object} schema - The schema object for the tool
 * @param {Function} handler - The handler function for the tool
 * @returns {Object} - Tool definition object
 */
export function createToolDefinition(schema, handler) {
    return { schema, handler };
}

/**
 * Creates an MCP response object with the given content
 *
 * @param {Array} content - Array of content objects (text, image, etc.)
 * @returns {Object} - MCP response object
 */
export function createMCPResponse(content) {
    return { content };
}

/**
 * Creates a text content object for MCP responses
 *
 * @param {string|Object} text - Text content or object to stringify
 * @param {boolean} [stringify=false] - Whether to stringify the text if it's an object
 * @returns {Object} - Text content object
 */
export function createTextContent(text, stringify = false) {
    return {
        type: "text",
        text: stringify ? JSON.stringify(text, null, 2) : text,
    };
}

/**
 * Creates an image content object for MCP responses
 *
 * @param {string} data - Base64-encoded image data
 * @param {string} mimeType - MIME type of the image
 * @returns {Object} - Image content object
 */
export function createImageContent(data, mimeType) {
    return {
        type: "image",
        data,
        mimeType,
    };
}

/**
 * Creates an audio content object for MCP responses
 *
 * @param {string} data - Base64-encoded audio data
 * @param {string} mimeType - MIME type of the audio
 * @returns {Object} - Audio content object
 */
export function createAudioContent(data, mimeType) {
    return {
        type: "audio",
        data,
        mimeType,
    };
}

/**
 * Builds a URL with path and query parameters
 *
 * @param {string} path - URL path (will be appended to API_BASE_URL)
 * @param {Object} params - Query parameters
 * @param {boolean} includeAuth - Whether to include auth query param (default: false, prefer headers)
 * @returns {string} - Complete URL
 */
export function buildUrl(path, params = {}, includeAuth = false) {
    const url = new URL(path, API_BASE_URL);

    // Merge params with auth query param if requested
    const allParams = includeAuth ? { ...params, ...getAuthQueryParam() } : params;

    // Add all non-undefined parameters
    Object.entries(allParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

/**
 * Builds a shareable URL without auth key
 * The URL will still work if it was generated once with auth
 *
 * @param {string} path - URL path (will be appended to API_BASE_URL)
 * @param {Object} params - Query parameters (auth key will be excluded)
 * @returns {string} - Complete URL without auth
 */
export function buildShareableUrl(path, params = {}) {
    const url = new URL(path, API_BASE_URL);

    // Add all non-undefined parameters, excluding any auth keys
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== "key" && key !== "token") {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

/**
 * Fetch wrapper that automatically includes auth headers
 * Includes timeout handling to prevent hanging requests
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options (can include timeoutMs)
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithAuth(url, options = {}) {
    const headers = {
        ...options.headers,
        ...getAuthHeaders(),
    };

    const timeoutMs = options.timeoutMs || 30000; // 30 second default timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            headers,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch JSON with auth headers
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed JSON response
 */
export async function fetchJsonWithAuth(url, options = {}) {
    const response = await fetchWithAuth(url, options);

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }

    return response.json();
}

/**
 * Fetch binary data with auth headers
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<{buffer: ArrayBuffer, contentType: string}>} - Binary data and content type
 */
export async function fetchBinaryWithAuth(url, options = {}) {
    const response = await fetchWithAuth(url, options);

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    return { buffer, contentType };
}

/**
 * Convert ArrayBuffer to base64 string
 *
 * @param {ArrayBuffer} buffer - Array buffer to convert
 * @returns {string} - Base64 encoded string
 */
export function arrayBufferToBase64(buffer) {
    return Buffer.from(buffer).toString("base64");
}

/**
 * Format error for MCP response
 *
 * @param {Error} error - Error object
 * @returns {Object} - MCP response with error message
 */
export function createErrorResponse(error) {
    return createMCPResponse([
        createTextContent(`Error: ${error.message}`),
    ]);
}

/**
 * Parse API error response into user-friendly message
 *
 * @param {number} status - HTTP status code
 * @param {string} errorText - Raw error text from response
 * @returns {string} - User-friendly error message
 */
export function parseApiError(status, errorText) {
    // Try to parse JSON error
    let parsed = null;
    try {
        parsed = JSON.parse(errorText);
    } catch {
        // Not JSON, use raw text
    }

    const errorMessage = parsed?.error?.message || parsed?.message || parsed?.error || errorText;

    // Common error patterns
    switch (status) {
        case 400:
            if (errorMessage.toLowerCase().includes("content moderation") ||
                errorMessage.toLowerCase().includes("safety") ||
                errorMessage.toLowerCase().includes("blocked")) {
                return `Content blocked by safety filters. Try rephrasing your prompt or disable 'safe' mode if appropriate.`;
            }
            if (errorMessage.toLowerCase().includes("invalid model")) {
                return `Invalid model specified. Use listImageModels or listTextModels to see available options.`;
            }
            return `Bad request: ${errorMessage}`;

        case 401:
            return `Authentication failed. Please set a valid API key using setApiKey. Get your key at https://pollinations.ai`;

        case 403:
            return `Access forbidden. Your API key may not have permission for this operation.`;

        case 404:
            return `Resource not found. The requested endpoint or model may not exist.`;

        case 429:
            return `Rate limited. You're making too many requests. ` +
                `If using pk_ (publishable) key, consider upgrading to sk_ (secret) key for higher limits.`;

        case 500:
            return `Server error: ${errorMessage}. Please try again later.`;

        case 502:
        case 503:
        case 504:
            return `Service temporarily unavailable. Please try again in a few moments.`;

        default:
            return `Request failed (${status}): ${errorMessage}`;
    }
}
