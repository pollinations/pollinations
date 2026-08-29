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
