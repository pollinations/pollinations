/**
 * Pollinations Authentication Utilities
 *
 * Simple API key management for authenticated requests to gen.pollinations.ai
 * Supports both publishable keys (pk_) and secret keys (sk_)
 */

// In-memory API key storage
let apiKey = process.env.POLLINATIONS_API_KEY || null;

/**
 * Set the API key for authenticated requests
 * @param {string} key - The API key (pk_ or sk_ prefixed)
 */
export function setApiKey(key) {
    if (key && typeof key === "string") {
        apiKey = key;
    }
}

/**
 * Get the currently stored API key
 * @returns {string|null} - The stored API key or null
 */
export function getApiKey() {
    return apiKey;
}

/**
 * Clear the stored API key
 */
export function clearApiKey() {
    apiKey = null;
}

/**
 * Check if an API key is currently set
 * @returns {boolean}
 */
export function hasApiKey() {
    return apiKey !== null && apiKey.length > 0;
}

/**
 * Get the key type (publishable or secret)
 * @returns {string|null} - 'publishable', 'secret', or null if no key
 */
export function getKeyType() {
    if (!apiKey) return null;
    if (apiKey.startsWith("pk_")) return "publishable";
    if (apiKey.startsWith("sk_")) return "secret";
    return "unknown";
}

/**
 * Get authorization headers for API requests
 * @returns {Object} - Headers object with Authorization if key is set
 */
export function getAuthHeaders() {
    if (!apiKey) return {};
    return {
        Authorization: `Bearer ${apiKey}`,
    };
}

/**
 * Get authorization query parameter for API requests
 * @returns {Object} - Query params object with key if set
 */
export function getAuthQueryParam() {
    if (!apiKey) return {};
    return { key: apiKey };
}

/**
 * Get masked version of the API key for display
 * @returns {string|null} - Masked key like "pk_...abc123" or null
 */
export function getMaskedKey() {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return "***";
    return `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 6)}`;
}
