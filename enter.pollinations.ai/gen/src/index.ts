import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Env } from "../../src/env";
import { proxyRoutes } from "../../src/routes/proxy";
import { logger } from "../../src/middleware/logger";
import { auth } from "../../src/middleware/auth";

const app = new Hono<Env>()
    .use("*", requestId())
    .use("*", logger)
    .use(
        "*",
        cors({
            origin: "*",
            allowHeaders: ["authorization", "content-type"],
            allowMethods: ["GET", "POST", "OPTIONS"],
        })
    )
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }))
    .route("/", proxyRoutes)
    .get("/health", (c) => c.json({ status: "ok" }))
    .get("/debug-secrets", (c) => {
        const hasGithubId = !!c.env.GITHUB_CLIENT_ID;
        const hasGithubSecret = !!c.env.GITHUB_CLIENT_SECRET;
        const hasJwtSecret = !!c.env.JWT_SECRET;
        console.log("DEBUG: Secrets check", { hasGithubId, hasGithubSecret, hasJwtSecret });
        return c.json({ 
            hasGithubId, 
            hasGithubSecret, 
            hasJwtSecret,
            githubIdPrefix: c.env.GITHUB_CLIENT_ID?.substring(0, 4)
        });
    });

export default app;
