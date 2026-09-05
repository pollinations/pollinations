/**
 * Worker entry point for pollinations.ai
 * Serves static assets and rewrites meta tags per route for SEO.
 *
 * The site talks to the public APIs (gen/enter) directly from the browser using
 * the publishable BYOP app key (see src/config.ts). This worker also exposes a
 * tiny cached proxy for Discord's public presence count, whose widget response
 * cannot be read directly by browsers because it does not include CORS headers.
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

interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

const DISCORD_GUILD_ID = "885844321461485618";
const DISCORD_PRESENCE_PATH = "/api/discord-presence";
const DISCORD_PRESENCE_TTL_SECONDS = 30;
const GITHUB_STARS_PATH = "/api/github-stars";
const GITHUB_STARS_TTL_SECONDS = 15 * 60;

async function cachedJson<T>(
    request: Request,
    ctx: ExecutionContext,
    ttlSeconds: number,
    load: () => Promise<T>,
) {
    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cacheKey = new Request(request.url, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
        const result = Response.json(await load(), {
            headers: {
                "Cache-Control": `public, max-age=${ttlSeconds}`,
            },
        });
        ctx.waitUntil(cache.put(cacheKey, result.clone()));
        return result;
    } catch {
        return Response.json(
            { error: "Live data is temporarily unavailable" },
            { status: 502 },
        );
    }
}

async function discordPresence(request: Request, ctx: ExecutionContext) {
    return cachedJson(request, ctx, DISCORD_PRESENCE_TTL_SECONDS, async () => {
        const response = await fetch(
            `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`,
        );
        if (!response.ok) throw new Error(`discord: ${response.status}`);

        const widget = (await response.json()) as {
            presence_count?: number;
        };
        if (typeof widget.presence_count !== "number") {
            throw new Error("discord: invalid presence count");
        }

        return { presence_count: widget.presence_count };
    });
}

async function githubStars(request: Request, ctx: ExecutionContext) {
    return cachedJson(request, ctx, GITHUB_STARS_TTL_SECONDS, async () => {
        const response = await fetch(
            "https://api.github.com/repos/pollinations/pollinations",
            {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": "pollinations.ai",
                },
            },
        );
        if (response.ok) {
            const repo = (await response.json()) as {
                stargazers_count?: number;
            };
            if (typeof repo.stargazers_count === "number") {
                return { stargazers_count: repo.stargazers_count };
            }
        }

        // GitHub's anonymous API limit is shared by the Worker's egress IP.
        // The public repository page exposes the same live count without a
        // credential, so it is a safe fallback for this decorative signal.
        const page = await fetch(
            "https://github.com/pollinations/pollinations",
            { headers: { "User-Agent": "pollinations.ai" } },
        );
        if (!page.ok) throw new Error(`github page: ${page.status}`);

        const html = await page.text();
        const match = html.match(
            /id="repo-stars-counter-star"[^>]*aria-label="([\d,]+) users? starred this repository"/,
        );
        const stargazersCount = match
            ? Number(match[1].replace(/,/g, ""))
            : Number.NaN;
        if (!Number.isSafeInteger(stargazersCount)) {
            throw new Error("github page: invalid star count");
        }

        return { stargazers_count: stargazersCount };
    });
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
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<Response> {
        const url = new URL(request.url);

        // www is routed only so it can redirect to the canonical apex host.
        if (url.hostname.startsWith("www.")) {
            url.hostname = url.hostname.slice(4);
            return Response.redirect(url.toString(), 301);
        }

        if (
            request.method === "GET" &&
            url.pathname === DISCORD_PRESENCE_PATH
        ) {
            return discordPresence(request, ctx);
        }

        if (request.method === "GET" && url.pathname === GITHUB_STARS_PATH) {
            return githubStars(request, ctx);
        }

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
