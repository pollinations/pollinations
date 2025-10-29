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

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", (c) => {
    return createAuth(c.env).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/tiers", tiersRoutes)
    .route("/generate", proxyRoutes);

const docsRoutes = createDocsRoutes(api);

const app = new Hono<Env>()
    .use(
        "*",
        cors({
            origin: (origin) => {
                // Allow localhost on any port for development
                if (origin.startsWith("http://localhost:")) return origin;
                // Production origins
                if (origin === "https://enter.pollinations.ai") return origin;
                if (origin === "https://beta.pollinations.ai") return origin;
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

app.notFound((c) => {
    return handleError(new HTTPException(404), c);
});

app.onError(handleError);

export type AppRoutes = typeof app;

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
