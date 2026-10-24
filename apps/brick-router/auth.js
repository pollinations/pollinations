export function hasAgentRunToken(request) {
    const authorization = request.headers.get("authorization")?.trim() ?? "";
    const [scheme, token, extra] = authorization.split(/\s+/);
    return (
        extra === undefined &&
        scheme?.toLowerCase() === "bearer" &&
        token?.startsWith("ag_") &&
        token.length > 3
    );
}

export async function validateAgentRunToken(request, fetcher = fetch) {
    if (!hasAgentRunToken(request)) return false;
    const response = await fetcher("https://gen.pollinations.ai/account/key", {
        headers: { authorization: request.headers.get("authorization") },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    return response.ok;
}
