import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Env } from "../../src/env";
import { proxyRoutes } from "./routes/proxy";
import { llmRouterRoutes } from "./routes/llmRouter";
import { logger } from "../../src/middleware/logger";
import { auth } from "../../src/middleware/auth";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";

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
    );

// Create API docs for gen service (must be before auth middleware)
const genApiRouter = new Hono<Env>()
    .route("/", proxyRoutes)
    .route("/", llmRouterRoutes);

app.get(
    "/api/docs/open-api/generate-schema",
    openAPIRouteHandler(genApiRouter, {
        documentation: {
            servers: [{ url: "/" }],
            info: {
                title: "Pollinations Gen API",
                version: "0.3.0",
                description: [
                    "Text and Image generation endpoints.",
                    "",
                    "## Authentication",
                    "",
                    "Include your API key in the `Authorization` header:",
                    "```",
                    "Authorization: Bearer YOUR_API_KEY",
                    "```",
                    "",
                    "Create API keys at https://enter.pollinations.ai",
                ].join("\n"),
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "API Key",
                    },
                },
            },
            security: [{ bearerAuth: [] }],
        },
    })
);

// Add Scalar docs UI (public, no auth required)
app.get(
    "/api/docs",
    (c, next) => Scalar<Env>({
        pageTitle: "Pollinations Gen API Docs",
        title: "Pollinations Gen API",
        theme: "saturn",
        sources: [
            {
                url: "/api/docs/open-api/generate-schema",
                title: "Gen API (Text & Images)",
                default: true,
            },
        ],
        authentication: {
            preferredSecurityScheme: "bearerAuth",
            securitySchemes: {
                bearerAuth: {
                    token: "",
                },
            },
        },
    })(c, next)
);

// Apply auth middleware to all other routes
app.use("*", auth({ allowApiKey: true, allowSessionCookie: false }))
    .route("/", proxyRoutes)
    .get("/health", (c) => c.json({ status: "ok" }))
    .route("/", llmRouterRoutes);

export default app;
