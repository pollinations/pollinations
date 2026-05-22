import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { frontendApi } from "./frontend-api.ts";
import { adminRoutes } from "./routes/admin.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", async (c) => {
    return await createAuth(c.env, c.executionCtx).handler(c.req.raw);
});

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/", frontendApi)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/admin", adminRoutes);

export type ApiRoutes = typeof api;
