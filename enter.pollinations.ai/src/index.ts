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

// SPA dashboard routes mirrored from the TanStack router routeTree.gen.ts
// (frontend/src/routeTree.gen.ts). Used by the catch-all below to decide
// whether a missing path should fall back to /index.html or to a real 404.
const SPA_ROUTES: ReadonlySet<string> = new Set([
    "/",
    "/authorize",
    "/device",
    "/edit-key",
    "/error",
    "/grant",
    "/privacy",
    "/refunds",
    "/terms",
    "/top-up",
    "/account",
    "/activity",
    "/keys",
    "/models",
    "/my-models",
    "/news",
    "/pollen",
    "/quests",
    "/sandboxes",
    "/sign-in",
    "/app/sign-in",
]);

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
    // Issue #17787: SPA fallback (not_found_handling = "single-page-application")
    // currently rewrites every unknown path to /index.html with 200 text/html,
    // so an agent that GETs /auth.md or /llms-full.txt sees the dashboard shell.
    // wrangler.toml routes everything except real asset files to the Worker;
    // the Worker forwards the request to the assets binding, falls back to
    // /index.html only for known SPA routes, and 404s the rest (matches
    // gen.pollinations.ai and the main site after #15261).
    .get("*", async (c) => {
        const path = c.req.path;
        const wantsIndex = path === "/" || SPA_ROUTES.has(path);
        const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
        if (assetResponse.status !== 404) return assetResponse;
        if (wantsIndex) {
            const indexResponse = await c.env.ASSETS.fetch(
                new Request(new URL("/index.html", c.req.url), c.req.raw),
            );
            if (indexResponse.status === 200) return indexResponse;
        }
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
