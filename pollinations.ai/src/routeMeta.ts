export type RouteMeta = { title: string; description: string };

export const ROUTE_META: Record<string, RouteMeta> = {
    "/": {
        title: "pollinations.ai — Every model, one wallet.",
        description:
            "Open infrastructure for text, image, audio and video generation, with one wallet and one API.",
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

export const NOT_FOUND_META: RouteMeta = {
    title: "Page not found | pollinations.ai",
    description: "The requested page could not be found.",
};

export function routeHead(path: keyof typeof ROUTE_META) {
    const meta = ROUTE_META[path];
    return {
        meta: [
            { title: meta.title },
            { name: "description", content: meta.description },
        ],
    };
}
