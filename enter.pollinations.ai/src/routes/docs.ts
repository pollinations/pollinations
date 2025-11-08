import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";

export const createDocsRoutes = (apiRouter: Hono<Env>) => {
    return new Hono<Env>()
        .get("/", (c, next) =>
            Scalar<Env>({
                pageTitle: "Pollinations.AI API Reference",
                title: "Pollinations.AI API Reference",
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
                            "[📝 Edit docs](https://github.com/pollinations/pollinations/edit/master/enter.pollinations.ai/src/routes/docs.ts)",
                            "",
                            "## Quick Start",
                            "",
                            "Get your API key at https://enter.pollinations.ai",
                            "",
                            "### Image Generation",
                            "```bash",
                            "curl 'https://enter.pollinations.ai/api/generate/image/a%20cat?model=flux' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY'",
                            "```",
                            "",
                            "### Text Generation",
                            "```bash",
                            "curl 'https://enter.pollinations.ai/api/generate/v1/chat/completions' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY' \\",
                            "  -H 'Content-Type: application/json' \\",
                            "  -d '{\"model\": \"openai\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}'",
                            "```",
                            "",
                            "### Simple Text Endpoint",
                            "```bash",
                            "curl 'https://enter.pollinations.ai/api/generate/text/hello?key=YOUR_API_KEY'",
                            "```",
                            "",
                            "### Streaming",
                            "```bash",
                            "curl 'https://enter.pollinations.ai/api/generate/v1/chat/completions' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY' \\",
                            "  -H 'Content-Type: application/json' \\",
                            "  -d '{\"model\": \"openai\", \"messages\": [{\"role\": \"user\", \"content\": \"Write a poem\"}], \"stream\": true}' \\",
                            "  --no-buffer",
                            "```",
                            "",
                            "### Model Discovery",
                            "**Always check available models before testing:**",
                            "",
                            "- **Image models:** [/api/generate/image/models](https://enter.pollinations.ai/api/generate/image/models)",
                            "- **Text models:** [/api/generate/v1/models](https://enter.pollinations.ai/api/generate/v1/models)",
                            "",
                            "## Authentication",
                            "",
                            "**Two key types:**",
                            "- **Publishable Keys (`pk_`):** Client-side safe, IP rate-limited (3 req/burst, 1/15sec refill)",
                            "- **Secret Keys (`sk_`):** Server-side only, no rate limits, can spend Pollen",
                            "",
                            "**Auth methods:**",
                            "1. Header: `Authorization: Bearer YOUR_API_KEY`",
                            "2. Query param: `?key=YOUR_API_KEY`",
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
