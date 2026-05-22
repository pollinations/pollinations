import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { accountRoutes } from "./routes/account.ts";
import { adminRoutes } from "./routes/admin.ts";
import { apiKeysRoutes } from "./routes/api-keys.ts";
import { appLookupRoutes } from "./routes/app-lookup.ts";
import { customerRoutes } from "./routes/customer.ts";
import { deviceRoutes } from "./routes/device.ts";
import { modelStatsRoutes } from "./routes/model-stats.ts";
import { stripeRoutes } from "./routes/stripe.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";
import { tiersRoutes } from "./routes/tiers.ts";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", async (c) => {
    return await createAuth(c.env, c.executionCtx).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/customer", customerRoutes)
    .route("/stripe", stripeRoutes)
    .route("/tiers", tiersRoutes)
    .route("/api-keys", apiKeysRoutes)
    .route("/app-lookup", appLookupRoutes)
    .route("/account", accountRoutes)
    .route("/device", deviceRoutes)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/admin", adminRoutes)
    .route("/model-stats", modelStatsRoutes);

export type ApiRoutes = typeof api;
