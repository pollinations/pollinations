import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { createAuth } from "./auth.ts";
import { handleError } from "./error.ts";
import { processEvents } from "./events.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { tiersRoutes } from "./routes/tiers.ts";
import { sessionKeyRoutes } from "./routes/session-key.ts";
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
    .route("/auth/session-key", sessionKeyRoutes)
    .route("/polar", polarRoutes)
    .route("/tiers", tiersRoutes)
    .route("/generate", proxyRoutes);

const docsRoutes = createDocsRoutes(api);

const app = new Hono<Env>()
    // Permissive CORS for public API endpoints (require API keys)
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
