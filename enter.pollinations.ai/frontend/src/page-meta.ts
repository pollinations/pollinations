import type { FileRoutesByFullPath } from "./routeTree.gen";

// Keep the Worker and dashboard navigation on the same page identity. The
// generated route type makes adding a page require an entry here.
const PAGE_TITLES: Record<keyof FileRoutesByFullPath, string> = {
    "/": "Dashboard",
    "/news": "News & FAQ",
    "/models": "Models",
    "/quests": "Quests",
    "/account": "Account",
    "/activity": "Activity",
    "/keys": "Keys",
    "/my-apps": "My Apps",
    "/my-models": "My Models",
    "/pollen": "Pollen",
    "/sandboxes": "Sandboxes",
    "/sign-in": "Sign in",
    "/app/sign-in": "Sign in",
    "/authorize": "Allow this app",
    "/device": "Allow your device",
    "/edit-key": "Edit key",
    "/error": "Sign in",
    "/grant": "Grant Pollen",
    "/top-up": "Top up",
    "/privacy": "Privacy",
    "/terms": "Terms",
    "/refunds": "Refunds",
};

const DESCRIPTIONS: Partial<Record<keyof FileRoutesByFullPath, string>> = {
    "/news":
        "Pollinations updates and answers to common questions about API access, models, Pollen, and building apps.",
    "/models":
        "Browse Pollinations models, capabilities, and pricing for image, text, video, and audio generation.",
    "/quests":
        "Explore Pollinations community quests and earn Pollen by contributing apps, tools, and improvements.",
};

export function pageMeta(pathname: string) {
    const path = (pathname.replace(/\/$/, "") || "/").toLowerCase();
    if (!Object.hasOwn(PAGE_TITLES, path)) return undefined;
    const page = path as keyof FileRoutesByFullPath;
    return {
        title: `${PAGE_TITLES[page]} | pollinations.ai`,
        description:
            DESCRIPTIONS[page] ??
            "Pollinations dashboard for AI generation APIs. Create API keys, track usage, monitor Pollen, and connect apps across image, text, video, and audio.",
        canonical: `https://enter.pollinations.ai${page === "/" ? "" : page}`,
    };
}
