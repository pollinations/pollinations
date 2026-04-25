type RouteDecision =
    | { kind: "robots"; response: Response }
    | { kind: "redirect"; location: string; status: 301 | 302 }
    | { kind: "generation"; url: URL }
    | { kind: "enter"; url: URL; noIndex: boolean };

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

function isGenerationApiPath(path: string): boolean {
    return path === "/api/generate" || path.startsWith("/api/generate/");
}

export function resolveRoute(inputUrl: URL): RouteDecision {
    const url = new URL(inputUrl);
    const path = url.pathname;

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

    if (isGenerationApiPath(path)) {
        return { kind: "generation", url };
    }

    if (path.startsWith("/api/")) {
        return {
            kind: "enter",
            url,
            noIndex: !path.startsWith("/api/docs"),
        };
    }

    if (path === "/account" || path === "/account/") {
        return { kind: "enter", url, noIndex: true };
    }

    if (path.startsWith("/account/")) {
        url.pathname = `/api${path}`;
        return { kind: "enter", url, noIndex: true };
    }

    url.pathname = `/api/generate${path}`;
    return { kind: "generation", url };
}
