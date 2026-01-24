import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { handleError } from "./error.ts";
import { logger } from "./middleware/logger.ts";
import { accountRoutes } from "./routes/account.ts";
import { adminRoutes } from "./routes/admin.ts";
import { apiKeysRoutes } from "./routes/api-keys.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { modelStatsRoutes } from "./routes/model-stats.ts";
import { nowpaymentsRoutes } from "./routes/nowpayments.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { stripeRoutes } from "./routes/stripe.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";
import { tiersRoutes } from "./routes/tiers.ts";
import { webhooksRoutes } from "./routes/webhooks.ts";
import { webhooksCryptoRoutes } from "./routes/webhooks-crypto.ts";
import { handleScheduled } from "./scheduled.ts";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/stripe", stripeRoutes)
    .route("/nowpayments", nowpaymentsRoutes)
    .route("/tiers", tiersRoutes)
    .route("/api-keys", apiKeysRoutes)
    .route("/account", accountRoutes)
    .route("/webhooks", webhooksRoutes)
    .route("/webhooks", webhooksCryptoRoutes)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/admin", adminRoutes)
    .route("/model-stats", modelStatsRoutes)
    .route("/generate", proxyRoutes);

export type ApiRoutes = typeof api;

const docsRoutes = createDocsRoutes(api);

const app = new Hono<Env>()
    // Permissive CORS for all API endpoints (all require API keys for auth)
    .use(
        "*",
        cors({
            origin: "*",
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
    scheduled: handleScheduled,
} satisfies ExportedHandler<CloudflareBindings>;
