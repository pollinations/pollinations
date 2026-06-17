import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { frontendApi } from "./frontend-api.ts";
import { adminRoutes } from "./routes/admin.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";

// API keys are created and updated exclusively through our own /api/api-keys
// routes, which validate redirect URIs (rejecting javascript:/data: schemes) and
// strip server-only metadata. Better Auth's native create/update endpoints store
// caller metadata verbatim, so leaving them open lets any session bypass that
// validation. Block them; delete/verify/list/get stay open (the frontend deletes
// via authClient.apiKey.delete).
const authRoutes = new Hono<Env>()
    .all("/api-key/create", (c) =>
        c.json(
            { error: "Manage API keys through the /api/api-keys routes" },
            405,
        ),
    )
    .all("/api-key/update", (c) =>
        c.json(
            { error: "Manage API keys through the /api/api-keys routes" },
            405,
        ),
    )
    .on(["GET", "POST"], "*", async (c) => {
        return await createAuth(c.env, c.executionCtx).handler(c.req.raw);
    });

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/", frontendApi)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/admin", adminRoutes);

export type ApiRoutes = typeof api;
