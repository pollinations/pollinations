import { Hono } from "hono";
import type { Env } from "./env.ts";
import { accountRoutes } from "./routes/account.ts";
import { apiKeysRoutes } from "./routes/api-keys.ts";
import { appLookupRoutes } from "./routes/app-lookup.ts";
import { customerRoutes } from "./routes/customer.ts";
import { deviceRoutes } from "./routes/device.ts";
import { modelStatsRoutes } from "./routes/model-stats.ts";
import { oauthRoutes } from "./routes/oauth.ts";
import { questsRoutes } from "./routes/quests.ts";
import { stripeRoutes } from "./routes/stripe.ts";

export const frontendApi = new Hono<Env>()
    .route("/customer", customerRoutes)
    .route("/stripe", stripeRoutes)
    .route("/api-keys", apiKeysRoutes)
    .route("/app-lookup", appLookupRoutes)
    .route("/account", accountRoutes)
    .route("/device", deviceRoutes)
    .route("/oauth", oauthRoutes)
    .route("/model-stats", modelStatsRoutes)
    .route("/quests", questsRoutes);

export type FrontendApiRoutes = typeof frontendApi;
