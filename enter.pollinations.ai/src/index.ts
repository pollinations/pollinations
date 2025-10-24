import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth.ts";
import { handleError } from "./error.ts";
import { processEvents } from "./events.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { requestId } from "hono/request-id";
import { logger } from "./middleware/logger.ts";
import { getLogger } from "@logtape/logtape";
import type { Env } from "./env.ts";
import { drizzle } from "drizzle-orm/d1";
import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", (c) => {
    return createAuth(c.env).handler(c.req.raw);
});

const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/generate", proxyRoutes);

const app = new Hono<Env>()
    .use("*", requestId())
    .use("*", logger)
    .route("/api", api)
    .get("/api/docs", (c, next) =>
        Scalar<Env>({
            pageTitle: "Pollinations.AI API Docs",
            title: "Pollinations.AI API Docs",
            theme: "saturn",
            sources: [
                { url: "/api/open-api/generate-schema", title: "API" },
                // Include better-auth docs only in development mode
                ...(c.env.ENVIRONMENT === "development"
                    ? [
                          {
                              url: "/api/auth/open-api/generate-schema",
                              title: "Auth",
                          },
                      ]
                    : []),
            ],
            authentication: {
                preferredSecurityScheme: 'bearerAuth',
                securitySchemes: {
                    bearerAuth: {
                        token: '', // Users input their own API key
                    },
                },
            },
        })(c, next),
    )
    .get(
        "/api/open-api/generate-schema",
        openAPIRouteHandler(api, {
            documentation: {
                servers: [{ url: "/api" }],
                info: {
                    title: "Pollinations.AI API",
                    version: "0.3.0",
                    description: [
                        "Documentation for `enter.pollinations.ai`.",
                        "",
                        "## Authentication",
                        "",
                        "This API uses Bearer token authentication for server-to-server requests.",
                        "Create an API key from your dashboard at https://enter.pollinations.ai",
                        "",
                        "Include your API key in the `Authorization` header:",
                        "```",
                        "Authorization: Bearer YOUR_API_KEY",
                        "```",
                        "",
                        "**Key Types:**",
                        "- **Server-to-Server Keys:** Best rate limits, access to all models, ability to spend Pollen on premium models",
                        "- **Front-End Keys:** Better rate limits for free models (Pollen spending coming soon)",
                        "",
                        "**Anonymous Access:** You can also use the API without authentication for free models with standard rate limits.",
                    ].join("\n"),
                },
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "API Key",
                            description: "API key from enter.pollinations.ai dashboard",
                        },
                    },
                },
                security: [
                    {
                        bearerAuth: [],
                    },
                ],
            },
        }),
    );

app.notFound((c) => {
    return handleError(new HTTPException(404), c);
});

app.onError(handleError);

export type AppRoutes = typeof app;

export default {
    fetch: app.fetch,
    scheduled: async (_controller, env, _ctx) => {
        const db = drizzle(env.DB);
        const log = getLogger(["hono"]);
        await processEvents(db, log, {
            polarAccessToken: env.POLAR_ACCESS_TOKEN,
            polarServer: env.POLAR_SERVER,
            tinybirdIngestUrl: env.TINYBIRD_INGEST_URL,
            tinybirdAccessToken: env.TINYBIRD_ACCESS_TOKEN,
        });
    },
} satisfies ExportedHandler<CloudflareBindings>;
