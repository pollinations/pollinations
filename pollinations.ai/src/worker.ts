/**
 * Worker entry point for pollinations.ai
 * Serves static assets and rewrites meta tags per route for SEO.
 *
 * The site talks to public APIs directly from the browser, so this worker does
 * no API proxying — it only serves assets and rewrites SEO metadata.
 */

// Cloudflare Workers types (minimal, avoids conflicts with DOM types)
interface CfElement {
    setAttribute(name: string, value: string): void;
    setInnerContent(content: string): void;
    append(content: string, options?: { html: boolean }): void;
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

const ROUTE_META: Record<string, { title: string; description: string }> = {
    "/": {
        title: "pollinations.ai",
        description:
            "Build AI apps with one API, free Pollen, user wallets, and developer earnings",
    },
    "/play": {
        title: "Play | pollinations.ai",
        description: "Generate images, text, audio and video with AI models",
    },
    "/apps": {
        title: "Apps | pollinations.ai",
        description: "Community-built apps powered by Pollinations AI",
    },
    "/community": {
        title: "Community | pollinations.ai",
        description: "Contributors, voting, and build diary",
    },
    "/terms": {
        title: "Terms | pollinations.ai",
        description: "Terms of service for pollinations.ai",
    },
    "/privacy": {
        title: "Privacy | pollinations.ai",
        description: "Privacy policy for pollinations.ai",
    },
    "/refunds": {
        title: "Refunds | pollinations.ai",
        description: "Refunds and cancellations policy for pollinations.ai",
    },
};

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
        "Build AI apps with one API, free Pollen, user wallets, and developer earnings",
});

const JSON_LD_PLAYGROUND = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Pollinations Playground",
    url: "https://pollinations.ai/play",
    applicationCategory: "MultimediaApplication",
    description: "Generate images, text, audio and video with AI models",
});

function getJsonLd(path: string): string | null {
    if (path === "/") return JSON_LD_HOME;
    if (path === "/play") return JSON_LD_PLAYGROUND;
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
        const meta = ROUTE_META[normalizedPath] || ROUTE_META["/"];
        const canonical = `https://pollinations.ai${normalizedPath === "/" ? "" : normalizedPath}`;
        const jsonLd = getJsonLd(normalizedPath);

        return new HTMLRewriter()
            .on("title", {
                element(el) {
                    el.setInnerContent(meta.title);
                },
            })
            .on('link[rel="canonical"]', {
                element(el) {
                    el.setAttribute("href", canonical);
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
                    el.setAttribute("content", canonical);
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
            .transform(response);
    },
};
