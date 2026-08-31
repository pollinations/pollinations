const environmentApiKey =
    (typeof process !== "undefined" && process.env?.POLLINATIONS_API_KEY) ||
    null;

function apiKeyFor(context) {
    return context?.http?.authInfo?.token || environmentApiKey;
}

export function getAuthHeaders(context) {
    const apiKey = apiKeyFor(context);
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export function requireApiKey(context) {
    if (!apiKeyFor(context)) {
        throw new Error(
            "API key required. Send an Authorization bearer token or set POLLINATIONS_API_KEY. " +
                "Get your key at https://enter.pollinations.ai/keys",
        );
    }
}
