function resolveApiKey(context) {
    return context?.http?.authInfo?.token || null;
}

export function getAuthHeaders(context) {
    const key = resolveApiKey(context);
    return key ? { Authorization: `Bearer ${key}` } : {};
}

export function requireApiKey(context) {
    if (!resolveApiKey(context)) {
        throw new Error(
            "API key required. Send it as an Authorization bearer token. " +
                "Get your key at https://enter.pollinations.ai/keys",
        );
    }
}
