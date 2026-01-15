import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { handleError } from "./error.ts";
import { logger } from "./middleware/logger.ts";
import { adminRoutes } from "./routes/admin.ts";
import { apiKeysRoutes } from "./routes/api-keys.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { modelStatsRoutes } from "./routes/model-stats.ts";
import { nowpaymentsRoutes } from "./routes/nowpayments.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { tiersRoutes } from "./routes/tiers.ts";
import { usageDailyRoutes, usageRoutes } from "./routes/usage.ts";
import { webhooksRoutes } from "./routes/webhooks.ts";
import { webhooksCryptoRoutes } from "./routes/webhooks-crypto.ts";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/nowpayments", nowpaymentsRoutes)
    .route("/tiers", tiersRoutes)
    .route("/api-keys", apiKeysRoutes)
    .route("/usage", usageRoutes)
    .route("/usage/daily", usageDailyRoutes)
    .route("/webhooks", webhooksRoutes)
    .route("/webhooks", webhooksCryptoRoutes)
    .route("/admin", adminRoutes)
    .route("/model-stats", modelStatsRoutes)
    .route("/generate", proxyRoutes);

export type ApiRoutes = typeof api;

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
            exposeHeaders: ["Content-Length", "Content-Disposition"],
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
} satisfies ExportedHandler<CloudflareBindings>;
