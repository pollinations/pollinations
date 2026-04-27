type RouteDecision =
    | { kind: "robots"; response: Response }
    | { kind: "redirect"; location: string; status: 301 | 302 }
    | { kind: "generation"; url: URL }
    | { kind: "enter"; url: URL; noIndex: boolean };

export type RouteClass =
    | "generation"
    | "docs"
    | "account-api"
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
const ACCOUNT_API_PREFIX = "/api/account";
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

    if (
        path === ACCOUNT_API_PREFIX ||
        path.startsWith(`${ACCOUNT_API_PREFIX}/`) ||
        path.startsWith(`${ACCOUNT_PREFIX}/`)
    ) {
        return "account-api";
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
    const matchPath = stripTrailingSlash(path);
    const routeClass = classifyRoute(matchPath);

    if (path === "/robots.txt") {
        return {
            kind: "robots",
            response: new Response(robotsTxt, {
                headers: { "Content-Type": "text/plain" },
            }),
        };
    }

    if (matchPath === "/" || matchPath === "/docs") {
        return {
            kind: "redirect",
            location: `${url.origin}/api/docs`,
            status: 301,
        };
    }

    if (matchPath === "/models") {
        url.pathname = "/api/generate/text/models";
        return { kind: "generation", url };
    }

    if (routeClass === "generation" && isGenerationApiPath(path)) {
        return { kind: "generation", url };
    }

    if (routeClass === "docs") {
        url.pathname = matchPath;
        return {
            kind: "generation",
            url,
        };
    }

    if (routeClass === "account-api") {
        url.pathname = matchPath.startsWith(`${ACCOUNT_PREFIX}/`)
            ? `/api${matchPath}`
            : matchPath;
        return {
            kind: "generation",
            url,
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

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
