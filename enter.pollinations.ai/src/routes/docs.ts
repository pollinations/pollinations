import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";

export const createDocsRoutes = (apiRouter: Hono<Env>) => {
    return new Hono<Env>()
        .get("/", (c, next) =>
            Scalar<Env>({
                pageTitle: "Pollinations.AI API Docs",
                title: "Pollinations.AI API Docs",
                theme: "saturn",
                sources: [
                    { url: "/api/docs/open-api/generate-schema", title: "API" },
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
            "/open-api/generate-schema",
            openAPIRouteHandler(apiRouter, {
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
                            "- **Secret Keys:** Best rate limits, access to all models",
                            "- **Publishable Keys:** Access to all models with IP-based rate limiting",
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
};
