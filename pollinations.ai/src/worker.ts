/**
 * Worker entry point for pollinations.ai
 * Serves static assets and rewrites meta tags per route for SEO.
 *
 * The site talks to the public APIs (gen/enter) directly from the browser using
 * the publishable BYOP app key (see src/config.ts).
 */

import { getJsonLd, knownPage, NOT_FOUND_META, ROUTE_META } from "./routeMeta";

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

        // Serve static assets with per-route meta tag rewriting for SEO
        const response = await env.ASSETS.fetch(request);

        // Only rewrite HTML responses (SPA pages, not JS/CSS/images)
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
            return response;
        }

        const page = knownPage(url.pathname);
        const meta = page ? ROUTE_META[page] : NOT_FOUND_META;
        const canonical = `https://pollinations.ai${page === "/" ? "" : page}`;
        const jsonLd = page ? getJsonLd(page) : null;

        const htmlResponse = page
            ? response
            : new Response(response.body, {
                  status: 404,
                  statusText: "Not Found",
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
        return rewriter.transform(htmlResponse);
    },
};
