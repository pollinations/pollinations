import { Hono } from "hono";
import type { Env } from "./env.ts";
import { accountRoutes } from "./routes/account.ts";
import { publicAgentSyncRoutes } from "./routes/agents.ts";
import { appLookupRoutes } from "./routes/app-lookup.ts";
import { deviceRoutes } from "./routes/device.ts";
import { integrationsRoutes } from "./routes/integrations.ts";
import { oauthRoutes } from "./routes/oauth.ts";
import { productAnalyticsRoutes } from "./routes/product-analytics.ts";
import { questsRoutes } from "./routes/quests.ts";
import { referralRoutes } from "./routes/referral.ts";
import { statusNoticeRoutes } from "./routes/status-notice.ts";
import { stripeRoutes } from "./routes/stripe.ts";
import { x402KeysRoutes } from "./routes/x402-keys.ts";

export const frontendApi = new Hono<Env>()
    .route("/stripe", stripeRoutes)
    .route("/x402/keys", x402KeysRoutes)
    .route("/app-lookup", appLookupRoutes)
    .route("/account/integrations", integrationsRoutes)
    .route("/account/agents", publicAgentSyncRoutes)
    .route("/account", accountRoutes)
    .route("/device", deviceRoutes)
    .route("/oauth", oauthRoutes)
    .route("/referral", referralRoutes)
    .route("/analytics", productAnalyticsRoutes)
    .route("/status-notice", statusNoticeRoutes)
    .route("/quests", questsRoutes);

export type FrontendApiRoutes = typeof frontendApi;
