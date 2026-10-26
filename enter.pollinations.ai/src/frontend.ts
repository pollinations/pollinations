import { NOT_FOUND_META, pageMeta } from "../frontend/src/page-meta.ts";

export function rewriteFrontendHtml(
    response: Response,
    meta: NonNullable<ReturnType<typeof pageMeta>> | typeof NOT_FOUND_META,
): Response {
    const rewriter = new HTMLRewriter().on("title", {
        element: (el) => {
            el.setInnerContent(meta.title);
        },
    });
    for (const [selector, attribute, value] of [
        ['meta[name="description"]', "content", meta.description],
        ['meta[property="og:description"]', "content", meta.description],
        ['meta[name="twitter:description"]', "content", meta.description],
        ['meta[property="og:title"]', "content", meta.title],
        ['meta[name="twitter:title"]', "content", meta.title],
        ['meta[property="og:url"]', "content", meta.canonical],
        ['link[rel="canonical"]', "href", meta.canonical],
    ] as const) {
        rewriter.on(selector, {
            element: (el) => {
                if (value === null) el.remove();
                else el.setAttribute(attribute, value);
            },
        });
    }
    return rewriter.transform(response);
}

export async function serveFrontend(request: Request, assets: Fetcher) {
    const url = new URL(request.url);
    const legalPath = url.pathname.replace(/\/$/, "").toLowerCase();
    if (["/privacy", "/terms", "/refunds"].includes(legalPath))
        return Response.redirect(`https://pollinations.ai${legalPath}`, 301);

    const meta = pageMeta(url.pathname);
    // Cloudflare serves existing assets directly; misses reach this handler.
    let response = await assets.fetch(request);
    if (!meta && response.status !== 404) return response;
    if (response.status === 404) {
        // Unknown pages must not inherit the homepage's conditional 304 response.
        response = await assets.fetch(
            new Request(
                new URL("/", url),
                meta ? request : { method: request.method },
            ),
        );
    }
    if (!response.headers.get("Content-Type")?.includes("text/html"))
        return response;
    if (!meta)
        response = new Response(response.body, {
            status: 404,
            headers: response.headers,
        });
    return rewriteFrontendHtml(response, meta ?? NOT_FOUND_META);
}
