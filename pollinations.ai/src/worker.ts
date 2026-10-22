/**
 * Worker entry point for pollinations.ai
 * Serves static assets and rewrites meta tags per route for SEO.
 *
 * The site talks to the public APIs (gen/enter) directly from the browser using
 * the publishable BYOP app key (see src/config.ts).
 */

import { getJsonLd, knownPage, NOT_FOUND_META, ROUTE_META } from "./routeMeta";

/**
 * RFC 8288 Link headers for every page this worker rewrites, so an agent that
 * fetches a page learns where the machine-readable surface lives. Registered
 * relations only: service-desc and service-doc (RFC 8631), api-catalog
 * (RFC 9727) and describedby. Same set as gen.pollinations.ai, with absolute
 * URLs because the targets live on that host.
 */
const AGENT_LINKS = [
    '<https://gen.pollinations.ai/openapi.json>; rel="service-desc"',
    '<https://gen.pollinations.ai/docs/llm.txt>; rel="service-doc"',
    '<https://gen.pollinations.ai/.well-known/api-catalog>; rel="api-catalog"',
    '<https://gen.pollinations.ai/.well-known/ai-catalog.json>; rel="describedby"',
].join(", ");

// Only the homepage has a summary; other pages need their full HTML content.
const HOME_MARKDOWN = `# ${ROUTE_META["/"].title}\n\n${ROUTE_META["/"].description}\n\nAgent entry point: https://gen.pollinations.ai/llms.txt\n`;

function acceptsMarkdown(accept: string): boolean {
    return accept.split(",").some((range) => {
        const [type, ...params] = range.trim().toLowerCase().split(";");
        if (type.trim() !== "text/markdown") return false;
        const q = params.find((param) => param.trim().startsWith("q="));
        const quality = q === undefined ? 1 : Number(q.split("=")[1]);
        return quality > 0 && quality <= 1;
    });
}

// Cloudflare Workers types (minimal, avoids conflicts with DOM types)
interface CfElement {
    setAttribute(name: string, value: string): void;
    setInnerContent(content: string): void;
    append(content: string, options?: { html: boolean }): void;
    remove(): void;
}
interface CfElementHandler {
    element(el: CfElement): void;
}
declare class HTMLRewriter {
    on(selector: string, handler: CfElementHandler): HTMLRewriter;
    transform(response: Response): Response;
}

interface Env {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.hostname === "old.pollinations.ai") {
            return Response.redirect("https://pollinations.ai/", 301);
        }

        if (url.hostname === "playground.pollinations.ai") {
            return Response.redirect("https://pollinations.ai/play", 301);
        }

        // www is routed only so it can redirect to the canonical apex host.
        if (url.hostname.startsWith("www.")) {
            url.hostname = url.hostname.slice(4);
            return Response.redirect(url.toString(), 301);
        }

        if (
            (request.method === "GET" || request.method === "HEAD") &&
            (url.pathname === "/docs" || url.pathname === "/docs/")
        ) {
            return Response.redirect("https://gen.pollinations.ai/docs", 301);
        }

        // Old image links (pollinations.ai/p/<prompt>, /prompt/<prompt>) still
        // arrive from sites that embed them. Netlify redirected them to the
        // image API until the move to Workers; keep sending them there.
        const legacyImage = url.pathname.match(/^\/(?:p|prompt)\/(.+)$/);
        if (
            legacyImage &&
            (request.method === "GET" || request.method === "HEAD")
        ) {
            return Response.redirect(
                `https://image.pollinations.ai/prompt/${legacyImage[1]}${url.search}`,
                301,
            );
        }

        const page = knownPage(url.pathname);
        if (
            page === "/" &&
            (request.method === "GET" || request.method === "HEAD") &&
            acceptsMarkdown(request.headers.get("accept") ?? "")
        ) {
            return new Response(
                request.method === "HEAD" ? null : HOME_MARKDOWN,
                {
                    headers: {
                        "Content-Type": "text/markdown; charset=utf-8",
                        Vary: "Accept",
                        // Cloudflare ignores Vary on cached responses: keep it private.
                        "Cache-Control": "private, max-age=3600",
                        Link: AGENT_LINKS,
                    },
                },
            );
        }

        // Serve static assets with per-route meta tag rewriting for SEO
        const response = await env.ASSETS.fetch(request);

        // Only rewrite HTML responses (SPA pages, not JS/CSS/images)
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
            return response;
        }

        const meta = page ? ROUTE_META[page] : NOT_FOUND_META;
        const canonical = `https://pollinations.ai${page === "/" ? "" : page}`;
        const jsonLd = page ? getJsonLd(page) : null;

        // Asset responses have immutable headers; copy before adding page metadata.
        const htmlResponse = new Response(response.body, {
            status: page ? response.status : 404,
            statusText: page ? response.statusText : "Not Found",
            headers: response.headers,
        });

        const rewriter = new HTMLRewriter().on("title", {
            element: (el) => el.setInnerContent(meta.title),
        });
        for (const [selector, content] of [
            ['meta[name="description"]', meta.description],
            ['meta[property="og:title"]', meta.title],
            ['meta[property="og:description"]', meta.description],
            ['meta[name="twitter:title"]', meta.title],
            ['meta[name="twitter:description"]', meta.description],
        ]) {
            rewriter.on(selector, {
                element: (el) => el.setAttribute("content", content),
            });
        }
        // Unknown routes are 404s, so they must not claim a canonical URL.
        for (const [selector, attribute] of [
            ['link[rel="canonical"]', "href"],
            ['meta[property="og:url"]', "content"],
        ]) {
            rewriter.on(selector, {
                element: (el) =>
                    page ? el.setAttribute(attribute, canonical) : el.remove(),
            });
        }
        if (jsonLd) {
            rewriter.on("head", {
                element: (el) =>
                    el.append(
                        `<script data-route-meta type="application/ld+json">${jsonLd}</script>`,
                        { html: true },
                    ),
            });
        }
        if (page) {
            htmlResponse.headers.set("Link", AGENT_LINKS);
            if (page === "/") htmlResponse.headers.append("Vary", "Accept");
        }
        return rewriter.transform(htmlResponse);
    },
};
