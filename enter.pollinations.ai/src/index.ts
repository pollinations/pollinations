import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { createAuth } from "./auth.ts";
import { handleError } from "./error.ts";
import { processEvents } from "./events.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { tiersRoutes } from "./routes/tiers.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { requestId } from "hono/request-id";
import { logger } from "./middleware/logger.ts";
import { getLogger } from "@logtape/logtape";
import type { Env } from "./env.ts";
import { drizzle } from "drizzle-orm/d1";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/tiers", tiersRoutes)
    .route("/generate", proxyRoutes);

const docsRoutes = createDocsRoutes(api);

// Check if request is for the gen.pollinations.ai API gateway
function isGenDomain(hostname: string): boolean {
    return hostname === "gen.pollinations.ai" || hostname === "gen.localhost";
}

const app = new Hono<Env>()
    // Path rewriting middleware for gen.pollinations.ai
    .use("*", async (c, next) => {
        const hostname = new URL(c.req.url).hostname;
        if (isGenDomain(hostname)) {
            const path = c.req.path;

            // Redirect root to /api/docs
            if (path === "/" || path === "/docs") {
                return c.redirect("/api/docs", 302);
            }

            // Convenience: /models -> /api/generate/text/models (most common use case)
            if (path === "/models") {
                c.req.raw = new Request(
                    c.req.url.replace(path, "/api/generate/text/models"),
                    c.req.raw,
                );
                return await next();
            }

            // Don't rewrite /assets, /api, or static files - let them fall through
            if (
                path.startsWith("/api/") ||
                path.startsWith("/assets/") ||
                path.match(/\.(js|css|png|jpg|svg|ico|webmanifest)$/)
            ) {
                return await next();
            }

            // Rewrite API paths: /image/*, /text/*, /v1/*, /openai -> /api/generate/*
            // Examples:
            //   /image/models -> /api/generate/image/models
            //   /image/my-prompt -> /api/generate/image/my-prompt
            //   /text/hello -> /api/generate/text/hello
            //   /v1/chat/completions -> /api/generate/v1/chat/completions
            //   /openai -> /api/generate/openai
            c.req.raw = new Request(
                c.req.url.replace(path, "/api/generate" + path),
                c.req.raw,
            );
        }
        await next();
    })
    // Permissive CORS for public API endpoints (require API keys)
    // Also applies to gen.pollinations.ai root paths (rewritten to /api/generate)
    .use(
        "/api/generate/*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
            exposeHeaders: ["Content-Length"],
            maxAge: 600,
        }),
    )
    // Restrictive CORS for auth/dashboard endpoints (use credentials)
    .use(
        "*",
        cors({
            origin: (origin) => {
                // Allow localhost on any port for development
                if (origin.startsWith("http://localhost:")) return origin;
                // Production origins
                if (origin.endsWith(".pollinations.ai")) return origin;
                return null;
            },
            credentials: true,
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
            exposeHeaders: ["Content-Length"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    .route("/api", api)
    .route("/api/docs", docsRoutes);

app.notFound(async (c) => {
    // Serve static assets for non-API routes (needed for gen.pollinations.ai)
    if (c.env.ASSETS) {
        return c.env.ASSETS.fetch(c.req.raw);
    }
    return await handleError(new HTTPException(404), c);
});

app.onError(handleError);

export type AppRoutes = typeof app;

// Export Durable Object for pollen-based rate limiting
export { PollenRateLimiter } from "./durable-objects/PollenRateLimiter.ts";

export default {
    fetch: app.fetch,
    scheduled: async (_controller, env, _ctx) => {
        const db = drizzle(env.DB);
        const log = getLogger(["hono"]);
        await processEvents(db, log, {
            polarAccessToken: env.POLAR_ACCESS_TOKEN,
            polarServer: env.POLAR_SERVER,
            tinybirdIngestUrl: env.TINYBIRD_INGEST_URL,
            tinybirdAccessToken: env.TINYBIRD_ACCESS_TOKEN,
        });
    },
} satisfies ExportedHandler<CloudflareBindings>;
