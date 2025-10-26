import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";
import { api } from "@/index.ts";

export const docsRoutes = new Hono<Env>()
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
                preferredSecurityScheme: "bearerAuth",
                securitySchemes: {
                    bearerAuth: {
                        token: "", // Users input their own API key
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
                        "- **Server-to-Server Keys:** Best rate limits, access to all models",
                        "- **Front-End Keys:** Access to all models with IP-based rate limiting",
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
                            description:
                                "API key from enter.pollinations.ai dashboard",
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
