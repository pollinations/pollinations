let apiKey =
    (typeof process !== "undefined" && process.env?.POLLINATIONS_API_KEY) ||
    null;

function resolveApiKey(context) {
    if (context?.http) {
        return context.http.authInfo?.token || null;
    }
    return apiKey;
}

/**
 * @param {string} key - The API key (pk_ or sk_ prefixed)
 */
export function setApiKey(key) {
    if (key && typeof key === "string") {
        apiKey = key;
    }
}

export function clearApiKey() {
    apiKey = null;
}

/**
 * @returns {boolean}
 */
export function hasApiKey(context) {
    const key = resolveApiKey(context);
    return key !== null && key.length > 0;
}

/**
 * @returns {string|null} - 'publishable', 'secret', or null if no key
 */
export function getKeyType(context) {
    const key = resolveApiKey(context);
    if (!key) return null;
    if (key.startsWith("pk_")) return "publishable";
    if (key.startsWith("sk_")) return "secret";
    return "unknown";
}

/**
 * @returns {Object} - Headers object with Authorization if key is set
 */
export function getAuthHeaders(context) {
    const key = resolveApiKey(context);
    if (!key) return {};
    return {
        Authorization: `Bearer ${key}`,
    };
}

/**
 * @returns {string|null} - Masked key like "pk_...abc123" or null
 */
export function getMaskedKey(context) {
    const key = resolveApiKey(context);
    if (!key) return null;
    if (key.length <= 8) return "***";
    return `${key.substring(0, 3)}...${key.substring(key.length - 6)}`;
}

export function requireApiKey(context) {
    if (!hasApiKey(context)) {
        throw new Error(
            "API key required. Send it as an Authorization bearer token, use setApiKey, or set POLLINATIONS_API_KEY. " +
                "Get your key at https://enter.pollinations.ai/keys",
        );
    }
}
