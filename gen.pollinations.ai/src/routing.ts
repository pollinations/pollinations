type RouteDecision =
    | { kind: "robots"; response: Response }
    | { kind: "redirect"; location: string; status: 301 | 302 }
    | { kind: "generation"; url: URL }
    | { kind: "enter"; url: URL; noIndex: boolean }
    | { kind: "notFound" };

export type RouteClass =
    | "generation"
    | "docs"
    | "account-api"
    | "unsupported-api"
    | "account-ui";

const robotsTxt = [
    "User-agent: *",
    "Allow: /docs",
    "Allow: /docs/llm.txt",
    "Disallow: /image/",
    "Disallow: /text/",
    "Disallow: /video/",
    "Disallow: /audio/",
    "Disallow: /v1/",
    "Disallow: /api/",
].join("\n");

const DOCS_PREFIX = "/docs";
const API_PREFIX = "/api";
const ACCOUNT_PREFIX = "/account";

export function classifyRoute(path: string): RouteClass {
    if (path === "/models") {
        return "generation";
    }

    if (path === DOCS_PREFIX || path.startsWith(`${DOCS_PREFIX}/`)) {
        return "docs";
    }

    if (path.startsWith(`${ACCOUNT_PREFIX}/`)) {
        return "account-api";
    }

    if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
        return "unsupported-api";
    }

    if (path === ACCOUNT_PREFIX) {
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

    if (matchPath === "/") {
        return {
            kind: "redirect",
            location: `${url.origin}/docs`,
            status: 301,
        };
    }

    if (matchPath === "/models") {
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
        url.pathname = `/api${matchPath}`;
        return {
            kind: "enter",
            url,
            noIndex: true,
        };
    }

    if (routeClass === "account-ui") {
        return { kind: "enter", url, noIndex: true };
    }

    if (routeClass === "unsupported-api") {
        return { kind: "notFound" };
    }

    return { kind: "generation", url };
}

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
