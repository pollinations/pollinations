import { pageMeta } from "../frontend/src/page-meta.ts";

export function rewriteFrontendHtml(
    response: Response,
    meta: NonNullable<ReturnType<typeof pageMeta>>,
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
    ]) {
        rewriter.on(selector, {
            element: (el) => {
                el.setAttribute(attribute, value);
            },
        });
    }
    return rewriter.transform(response);
}

export async function serveFrontend(request: Request, assets: Fetcher) {
    const url = new URL(request.url);
    const meta = pageMeta(url.pathname);
    // Cloudflare serves existing assets directly; misses reach this handler.
    // Only actual frontend routes receive the SPA shell. Unknown paths stay 404.
    if (!meta) return assets.fetch(request);
    const response = await assets.fetch(
        new Request(new URL("/", url), request),
    );
    if (!response.headers.get("Content-Type")?.includes("text/html"))
        return response;
    return rewriteFrontendHtml(response, meta);
}
