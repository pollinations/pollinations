export type RouteMeta = { title: string; description: string };

export const ROUTE_META: Record<string, RouteMeta> = {
    "/": {
        title: "pollinations.ai — Every model, one wallet.",
        description:
            "Build with AI models and ready-made agents through one platform, one API and a shared Pollen wallet.",
    },
    "/play": {
        title: "Play | pollinations.ai",
        description:
            "Chat with agents or generate images, video and audio in your browser using your own Pollen.",
    },
    "/apps": {
        title: "Apps | pollinations.ai",
        description:
            "Discover apps listed by the Pollinations community, from creative experiments to tools used at scale.",
    },
    "/community": {
        title: "Community | pollinations.ai",
        description:
            "Contribute to Pollinations, vote on ideas and explore monthly and daily build updates.",
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

export const NOT_FOUND_META: RouteMeta = {
    title: "Page not found | pollinations.ai",
    description: "The requested page could not be found.",
};

export function routeHead(path?: string) {
    const meta = (path && ROUTE_META[path]) || NOT_FOUND_META;
    const canonical =
        path && ROUTE_META[path]
            ? `https://pollinations.ai${path === "/" ? "" : path}`
            : null;
    const jsonLd = path ? getJsonLd(path) : null;
    return {
        meta: [
            { title: meta.title },
            { name: "description", content: meta.description },
            { property: "og:title", content: meta.title },
            { property: "og:description", content: meta.description },
            { name: "twitter:title", content: meta.title },
            { name: "twitter:description", content: meta.description },
            ...(canonical ? [{ property: "og:url", content: canonical }] : []),
        ],
        links: canonical ? [{ rel: "canonical", href: canonical }] : [],
        scripts: jsonLd
            ? [{ type: "application/ld+json", children: jsonLd }]
            : [],
    };
}

export function getJsonLd(path: string): string | null {
    if (path === "/")
        return JSON.stringify({
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
            description: ROUTE_META["/"].description,
        });
    if (path === "/play")
        return JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Pollinations Play",
            url: "https://pollinations.ai/play",
            applicationCategory: "MultimediaApplication",
            description: ROUTE_META["/play"].description,
        });
    return null;
}
