export type CodeAgentOutboundContext = {
    authorization: string;
    origin: string;
};

/** Add caller-funded authority after the request has left untrusted code. */
export function handleCodeAgentOutbound(
    request: Request,
    context: CodeAgentOutboundContext,
): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== context.origin) return fetch(request);

    const headers = new Headers(request.headers);
    headers.set("authorization", context.authorization);
    return fetch(new Request(request, { headers, redirect: "manual" }));
}
