let apiKey = process.env.POLLINATIONS_API_KEY || null;

/**
 * @param {string} key - The API key (pk_ or sk_ prefixed)
 */
export function setApiKey(key) {
    if (key && typeof key === "string") {
        apiKey = key;
    }
}

/**
 * @returns {string|null} - The stored API key or null
 */
export function getApiKey() {
    return apiKey;
}

export function clearApiKey() {
    apiKey = null;
}

/**
 * @returns {boolean}
 */
export function hasApiKey() {
    return apiKey !== null && apiKey.length > 0;
}

/**
 * @returns {string|null} - 'publishable', 'secret', or null if no key
 */
export function getKeyType() {
    if (!apiKey) return null;
    if (apiKey.startsWith("pk_")) return "publishable";
    if (apiKey.startsWith("sk_")) return "secret";
    return "unknown";
}

/**
 * @returns {Object} - Headers object with Authorization if key is set
 */
export function getAuthHeaders() {
    if (!apiKey) return {};
    return {
        Authorization: `Bearer ${apiKey}`,
    };
}

/**
 * @returns {Object} - Query params object with key if set
 */
export function getAuthQueryParam() {
    if (!apiKey) return {};
    return { key: apiKey };
}

/**
 * @returns {string|null} - Masked key like "pk_...abc123" or null
 */
export function getMaskedKey() {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return "***";
    return `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 6)}`;
}

export function requireApiKey() {
    if (!hasApiKey()) {
        throw new Error(
            "API key required. Use setApiKey tool first or set POLLINATIONS_API_KEY environment variable. " +
                "Get your key at https://enter.pollinations.ai",
        );
    }
}
