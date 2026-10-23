import type { FileRouteTypes } from "@frontend/routeTree.gen.ts";
import { handleError } from "@shared/error.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { api } from "./api.ts";
import type { Env } from "./env.ts";
import { logger } from "./middleware/logger.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { getCurrentGenOrigin, wellKnownRoutes } from "./routes/well-known.ts";
import { handleCodeAgentOutbound } from "./services/code-agent-outbound.ts";

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isApiDocsPath(path: string): boolean {
    return path === "/api/docs" || path.startsWith("/api/docs/");
}

// Every dashboard page. Typed by the router's route tree, so tsc fails when a
// page is added to the frontend but not here.
const DASHBOARD_PAGES: Record<FileRouteTypes["fullPaths"], true> = {
    "/": true,
    "/account": true,
    "/activity": true,
    "/app/sign-in": true,
    "/authorize": true,
    "/device": true,
    "/edit-key": true,
    "/error": true,
    "/grant": true,
    "/keys": true,
    "/models": true,
    "/my-apps": true,
    "/my-models": true,
    "/news": true,
    "/pollen": true,
    "/privacy": true,
    "/quests": true,
    "/refunds": true,
    "/sandboxes": true,
    "/sign-in": true,
    "/terms": true,
    "/top-up": true,
};

// The router matches paths in any case and with a trailing slash.
function isDashboardPage(path: string): boolean {
    return Object.hasOwn(
        DASHBOARD_PAGES,
        stripTrailingSlash(path).toLowerCase(),
    );
}

function redirectLegacyDocs(c: Context<Env>): Response {
    const reqUrl = new URL(c.req.url);
    const publicOrigin = new URL(getPublicOrigin(c));
    const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    url.protocol = "https:";
    url.pathname = url.pathname.replace(/^\/api\/docs(?=\/|$)/, "/docs");
    url.pathname = stripTrailingSlash(url.pathname);
    return c.redirect(url.toString(), 301);
}

const app = new Hono<Env>()
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: [],
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    // Prevent search engines from indexing API responses (except docs)
    .use("/api/*", async (c, next) => {
        await next();
        if (!isApiDocsPath(c.req.path)) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    })
    .route("/api/docs", createDocsRoutes(api))
    .all("/api/docs", redirectLegacyDocs)
    .all("/api/docs/", redirectLegacyDocs)
    .all("/api/docs/*", redirectLegacyDocs)
    .all("/api/generate/*", (c) => {
        const reqUrl = new URL(c.req.url);
        const publicOrigin = new URL(getPublicOrigin(c));
        const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
        url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
        url.protocol = "https:";
        url.pathname = url.pathname.replace(/^\/api\/generate/, "");
        c.header("Deprecation", "true");
        c.header(
            "Link",
            `<${getCurrentGenOrigin(c)}>; rel="successor-version"`,
        );
        return c.redirect(url.toString(), 308);
    })
    .route("/.well-known", wellKnownRoutes)
    .route("/api", api)
    // Asset files and dashboard pages come from the asset layer. Anything else
    // got the dashboard shell from its SPA fallback, so it is a real 404 and
    // agents can tell a missing file such as /auth.md from a page (#17787).
    .get("*", async (c) => {
        const response = await c.env.ASSETS.fetch(c.req.raw);
        const isShell = response.headers
            .get("content-type")
            ?.includes("text/html");
        if (!isShell || isDashboardPage(c.req.path)) return response;
        return c.notFound();
    });

app.notFound(async (c: Context<Env>) => {
    return await handleError(new HTTPException(404), c);
});

app.onError(handleError);

export default {
    fetch(request, env, ctx) {
        if (env.CODE_AGENT_CONTEXT) {
            return handleCodeAgentOutbound(request, env.CODE_AGENT_CONTEXT);
        }
        return app.fetch(request, env, ctx);
    },
} satisfies ExportedHandler<Env["Bindings"]>;
