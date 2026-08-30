/**
 * Worker entry point for pollinations.ai
 * Serves static assets and rewrites meta tags per route for SEO.
 *
 * The site talks to the public APIs (gen/enter) directly from the browser using
 * the publishable BYOP app key (see src/config.ts), so this worker does no
 * API proxying — it only serves assets and rewrites SEO metadata.
 */

import { NOT_FOUND_META, ROUTE_META } from "./routeMeta";

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

const JSON_LD_HOME = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "pollinations.ai",
    url: "https://pollinations.ai",
    logo: "https://pollinations.ai/icon-512.png",
    sameAs: [
        "https://github.com/pollinations",
        "https://discord.gg/pollinations-ai-885844321461485618",
        "https://x.com/pollinations_ai",
    ],
    description:
        "Open infrastructure for text, image, audio and video generation, with one wallet and one API.",
});

const JSON_LD_PLAY = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Pollinations Play",
    url: "https://pollinations.ai/play",
    applicationCategory: "MultimediaApplication",
    description: "Generate images, text, audio and video with AI models",
});

function getJsonLd(path: string): string | null {
    if (path === "/") return JSON_LD_HOME;
    if (path === "/play") return JSON_LD_PLAY;
    return null;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Serve static assets with per-route meta tag rewriting for SEO
        const response = await env.ASSETS.fetch(request);

        // Only rewrite HTML responses (SPA pages, not JS/CSS/images)
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
            return response;
        }

        const path = url.pathname === "" ? "/" : url.pathname;
        // Normalize: strip trailing slash (except root)
        const normalizedPath =
            path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
        const knownRoute = normalizedPath in ROUTE_META;
        const meta = knownRoute ? ROUTE_META[normalizedPath] : NOT_FOUND_META;
        const canonical = `https://pollinations.ai${normalizedPath === "/" ? "" : normalizedPath}`;
        const jsonLd = getJsonLd(normalizedPath);

        const htmlResponse = knownRoute
            ? response
            : new Response(response.body, {
                  status: 404,
                  statusText: "Not Found",
                  headers: response.headers,
              });

        return new HTMLRewriter()
            .on("title", {
                element(el) {
                    el.setInnerContent(meta.title);
                },
            })
            .on('link[rel="canonical"]', {
                element(el) {
                    if (knownRoute) el.setAttribute("href", canonical);
                    else el.remove();
                },
            })
            .on('meta[name="description"]', {
                element(el) {
                    el.setAttribute("content", meta.description);
                },
            })
            .on('meta[property="og:title"]', {
                element(el) {
                    el.setAttribute("content", meta.title);
                },
            })
            .on('meta[property="og:description"]', {
                element(el) {
                    el.setAttribute("content", meta.description);
                },
            })
            .on('meta[property="og:url"]', {
                element(el) {
                    if (knownRoute) el.setAttribute("content", canonical);
                    else el.remove();
                },
            })
            .on('meta[name="twitter:title"]', {
                element(el) {
                    el.setAttribute("content", meta.title);
                },
            })
            .on('meta[name="twitter:description"]', {
                element(el) {
                    el.setAttribute("content", meta.description);
                },
            })
            .on("head", {
                element(el) {
                    if (jsonLd) {
                        el.append(
                            `<script type="application/ld+json">${jsonLd}</script>`,
                            { html: true },
                        );
                    }
                },
            })
            .transform(htmlResponse);
    },
};
