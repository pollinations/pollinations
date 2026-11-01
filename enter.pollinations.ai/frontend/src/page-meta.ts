import type { FileRoutesByFullPath } from "./routeTree.gen";

// Keep the built page HTML and dashboard navigation on the same page identity.
// The generated route type makes adding a page require an entry here.
export const PAGE_TITLES: Record<keyof FileRoutesByFullPath, string> = {
    "/": "Dashboard",
    "/news": "News & FAQ",
    "/models": "Models",
    "/quests": "Quests",
    "/account": "Account",
    "/activity": "Activity",
    "/keys": "Keys",
    "/my-apps": "My Apps",
    "/my-models": "My Models",
    "/pollen": "pollen",
    "/sandboxes": "Sandboxes",
    "/sign-in": "Sign in",
    "/app/sign-in": "Sign in",
    "/authorize": "Allow this app",
    "/device": "Allow your device",
    "/edit-key": "Edit access",
    "/error": "Sign in",
    "/grant": "Allow access",
    "/top-up": "Top-up",
    "/privacy": "Privacy",
    "/terms": "Terms",
    "/refunds": "Refunds",
};

export const NOT_FOUND_META = {
    title: "Page not found | pollinations.ai",
    description: "The requested page could not be found.",
    canonical: null,
};

export function pageTitle(path: keyof FileRoutesByFullPath) {
    return `${PAGE_TITLES[path]} | pollinations.ai`;
}

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
        title: pageTitle(page),
        description:
            DESCRIPTIONS[page] ??
            "Pollinations dashboard for AI generation APIs. Create API keys, track usage, monitor Pollen, and connect apps across image, text, video, and audio.",
        canonical: `https://enter.pollinations.ai${page === "/" ? "" : page}`,
    };
}

type PageMeta =
    | NonNullable<ReturnType<typeof pageMeta>>
    | typeof NOT_FOUND_META;

// [tag, key, name, attribute, value]; a null value removes the tag.
export function metaTags(meta: PageMeta) {
    return [
        ["link", "rel", "canonical", "href", meta.canonical],
        ["meta", "property", "og:url", "content", meta.canonical],
        ["meta", "property", "og:title", "content", meta.title],
        ["meta", "name", "twitter:title", "content", meta.title],
        ["meta", "name", "description", "content", meta.description],
        ["meta", "property", "og:description", "content", meta.description],
        ["meta", "name", "twitter:description", "content", meta.description],
    ] as const;
}

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;");

// The build writes a copy of index.html per page (and 404.html) so crawlers
// see each page's tags without running JavaScript. A missing tag fails the
// build instead of shipping the homepage's metadata.
export function pageHtml(html: string, meta: PageMeta) {
    const swap = (pattern: RegExp, tag: string) => {
        if (!pattern.test(html))
            throw new Error(`index.html has no ${pattern}`);
        html = html.replace(pattern, () => tag);
    };
    swap(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
    for (const [tag, key, name, attribute, value] of metaTags(meta))
        swap(
            new RegExp(`<${tag} ${key}="${name}"[^>]*>`),
            value === null
                ? ""
                : `<${tag} ${key}="${name}" ${attribute}="${escapeHtml(value)}">`,
        );
    return html;
}
