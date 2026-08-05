const apiKey = process.env.POLLINATIONS_API_KEY;

/**
 * @returns {Object} - Headers object with Authorization if key is set
 */
export function getAuthHeaders() {
    if (!apiKey) return {};
    return {
        Authorization: `Bearer ${apiKey}`,
    };
}

export function requireApiKey() {
    if (!apiKey) {
        throw new Error(
            "API key required. Set the POLLINATIONS_API_KEY environment variable before starting the MCP server. " +
                "Get your key at https://enter.pollinations.ai/keys",
        );
    }
}
