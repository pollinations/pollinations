import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Env } from "../../src/env";
import { proxyRoutes } from "../../src/routes/proxy";
import { llmRouterRoutes } from "./routes/llmRouter";
import { logger } from "../../src/middleware/logger";
import { auth } from "../../src/middleware/auth";
import { createDocsRoutes } from "../../src/routes/docs";

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
    .route("/", llmRouterRoutes);

// Create API docs for gen service (text generation endpoints)
const genApiRouter = new Hono<Env>()
    .route("/", proxyRoutes)
    .route("/", llmRouterRoutes);

// Note: Docs are also available at enter.pollinations.ai/api/docs with unified view
const docsRouter = createDocsRoutes(genApiRouter);
app.route("/api/docs", docsRouter);

export default app;
