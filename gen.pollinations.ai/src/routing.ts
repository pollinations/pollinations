type RouteDecision =
    | { kind: "robots"; response: Response }
    | { kind: "redirect"; location: string; status: 301 | 302 }
    | { kind: "generation"; url: URL }
    | { kind: "enter"; url: URL; noIndex: boolean };

export type RouteClass =
    | "generation"
    | "docs"
    | "control-plane-api"
    | "account-ui";

const robotsTxt = [
    "User-agent: *",
    "Allow: /api/docs",
    "Allow: /api/docs/llm.txt",
    "Disallow: /image/",
    "Disallow: /text/",
    "Disallow: /video/",
    "Disallow: /audio/",
    "Disallow: /v1/",
    "Disallow: /api/generate/",
    "Disallow: /api/v1/",
].join("\n");

const GENERATION_API_PREFIX = "/api/generate";
const DOCS_API_PREFIX = "/api/docs";
const API_PREFIX = "/api/";
const ACCOUNT_PREFIX = "/account";

function isGenerationApiPath(path: string): boolean {
    return (
        path === GENERATION_API_PREFIX ||
        path.startsWith(`${GENERATION_API_PREFIX}/`)
    );
}

export function classifyRoute(path: string): RouteClass {
    if (path === "/models" || isGenerationApiPath(path)) {
        return "generation";
    }

    if (path === DOCS_API_PREFIX || path.startsWith(`${DOCS_API_PREFIX}/`)) {
        return "docs";
    }

    if (path.startsWith(API_PREFIX)) {
        return "control-plane-api";
    }

    if (path === ACCOUNT_PREFIX || path.startsWith(`${ACCOUNT_PREFIX}/`)) {
        return "account-ui";
    }

    return "generation";
}

export function resolveRoute(inputUrl: URL): RouteDecision {
    const url = new URL(inputUrl);
    const path = url.pathname;
    const routeClass = classifyRoute(path);

    if (path === "/robots.txt") {
        return {
            kind: "robots",
            response: new Response(robotsTxt, {
                headers: { "Content-Type": "text/plain" },
            }),
        };
    }

    if (path === "/" || path === "/docs") {
        return {
            kind: "redirect",
            location: `${url.origin}/api/docs`,
            status: 301,
        };
    }

    if (path === "/models") {
        url.pathname = "/api/generate/text/models";
        return { kind: "generation", url };
    }

    if (routeClass === "generation" && isGenerationApiPath(path)) {
        return { kind: "generation", url };
    }

    if (routeClass === "docs") {
        return {
            kind: "enter",
            url,
            noIndex: false,
        };
    }

    if (routeClass === "control-plane-api") {
        return {
            kind: "enter",
            url,
            noIndex: true,
        };
    }

    if (path === ACCOUNT_PREFIX || path === `${ACCOUNT_PREFIX}/`) {
        return { kind: "enter", url, noIndex: true };
    }

    if (routeClass === "account-ui") {
        url.pathname = `/api${path}`;
        return { kind: "enter", url, noIndex: true };
    }

    url.pathname = `/api/generate${path}`;
    return { kind: "generation", url };
}
