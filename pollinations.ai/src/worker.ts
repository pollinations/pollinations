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

/**
 * Map of Myceli upstream host -> public-facing host for requests proxied by the
 * pollinations-myceli-proxy (which sets x-forwarded-host). Mirrors
 * shared/public-origin.ts so canonical/OG URLs reflect the actual environment
 * (prod vs staging) instead of being hardcoded to prod.
 */
const TRUSTED_FORWARDED_HOSTS: Record<string, string> = {
    "pollinations.myceli.ai": "pollinations.ai",
    "staging.pollinations.myceli.ai": "staging.pollinations.ai",
};

/**
 * Public-facing origin of the request: honor a trusted x-forwarded-host (set by
 * the proxy in front of prod), otherwise fall back to the request's own origin
 * so staging serves its own canonical/OG URLs independently of prod.
 */
function getPublicOrigin(request: Request): string {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost && TRUSTED_FORWARDED_HOSTS[url.host] === forwardedHost) {
        const proto =
            request.headers.get("x-forwarded-proto") === "http"
                ? "http"
                : "https";
        return `${proto}://${forwardedHost}`;
    }
    return url.origin;
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
        const publicOrigin = getPublicOrigin(request);
        const canonical = `${publicOrigin}${normalizedPath === "/" ? "" : normalizedPath}`;
        const ogImage = `${publicOrigin}/og-image.png`;
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
            .on('meta[property="og:image"]', {
                element(el) {
                    el.setAttribute("content", ogImage);
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
            .on('meta[name="twitter:image"]', {
                element(el) {
                    el.setAttribute("content", ogImage);
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
