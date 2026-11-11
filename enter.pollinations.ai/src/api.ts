import { reportServerError } from "@shared/error.ts";
import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { frontendApi } from "./frontend-api.ts";
import { adminRoutes } from "./routes/admin.ts";
import { githubSecretScanningRoutes } from "./routes/github-secret-scanning.ts";
import { questLeaderboardRoutes } from "./routes/quest-leaderboard.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";

// API keys are managed only through /account/keys, which validates redirect
// URIs (rejecting javascript:/data: schemes) and strips server-only metadata.
// Better Auth's native api-key endpoints store caller metadata verbatim and
// duplicate that API, so they are all blocked.
const authRoutes = new Hono<Env>()
    .all("/api-key/*", (c) =>
        c.json({ error: "Manage API keys through /account/keys" }, 405),
    )
    .on(["GET", "POST"], "*", async (c) => {
        // Better Auth answers its own 5xx: report it with the first error
        // Better Auth logged, which carries the cause (a D1 failure).
        let logged: string | undefined;
        const response = await createAuth(c.env, c.executionCtx, (message) => {
            logged ??= message;
        }).handler(c.req.raw);
        if (response.status >= 500)
            await reportServerError(
                c,
                new Error(logged ?? `Better Auth answered ${response.status}`),
                response.status,
            );
        return response;
    });

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/quests", questLeaderboardRoutes)
    .route("/", frontendApi)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/webhooks", githubSecretScanningRoutes)
    .route("/admin", adminRoutes);
