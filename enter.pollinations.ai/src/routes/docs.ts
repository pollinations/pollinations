import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";

// Transform OpenAPI schema for gen.pollinations.ai:
// 1. Remove /generate/ prefix from paths
// 2. Add x-tagGroups for Scalar sidebar organization
function transformOpenAPISchema(
    schema: Record<string, unknown>,
): Record<string, unknown> {
    const paths = schema.paths as Record<string, unknown> | undefined;
    if (!paths) return schema;

    const newPaths: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(paths)) {
        // Strip /generate prefix: /generate/v1/models → /v1/models
        const cleanPath = path.replace(/^\/generate/, "");
        newPaths[cleanPath] = value;
    }

    return {
        ...schema,
        paths: newPaths,
    };
}

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
        .get("/open-api/generate-schema", async (c, next) => {
            // Generate schema using hono-openapi, then transform paths to remove /generate prefix
            const handler = openAPIRouteHandler(apiRouter, {
                documentation: {
                    servers: [{ url: "https://gen.pollinations.ai" }],
                    info: {
                        title: "Pollinations.AI API",
                        version: "0.3.0",
                        description: [
                            "Documentation for `gen.pollinations.ai` - the Pollinations.AI API gateway.",
                            "",
                            "[📝 Edit docs](https://github.com/pollinations/pollinations/edit/master/enter.pollinations.ai/src/routes/docs.ts)",
                            "",
                            "## Quick Start",
                            "",
                            "Get your API key at https://enter.pollinations.ai",
                            "",
                            "### Image Generation",
                            "```bash",
                            "curl 'https://gen.pollinations.ai/image/a%20cat?model=flux' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY'",
                            "```",
                            "",
                            "### Text Generation",
                            "```bash",
                            "curl 'https://gen.pollinations.ai/v1/chat/completions' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY' \\",
                            "  -H 'Content-Type: application/json' \\",
                            '  -d \'{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}\'',
                            "```",
                            "",
                            "### Vision (Image Input)",
                            "```bash",
                            "curl 'https://gen.pollinations.ai/v1/chat/completions' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY' \\",
                            "  -H 'Content-Type: application/json' \\",
                            '  -d \'{"model": "openai", "messages": [{"role": "user", "content": [{"type": "text", "text": "Describe this image"}, {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}]}]}\'',
                            "```",
                            "",
                            "**Note:** `gemini` model has `code_execution`, `google_search`, `url_context` tools enabled by default. Pass your own `tools` array to override.",
                            "",
                            "### Simple Text Endpoint",
                            "```bash",
                            "curl 'https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY'",
                            "```",
                            "",
                            "### Streaming",
                            "```bash",
                            "curl 'https://gen.pollinations.ai/v1/chat/completions' \\",
                            "  -H 'Authorization: Bearer YOUR_API_KEY' \\",
                            "  -H 'Content-Type: application/json' \\",
                            '  -d \'{"model": "openai", "messages": [{"role": "user", "content": "Write a poem"}], "stream": true}\' \\',
                            "  --no-buffer",
                            "```",
                            "",
                            "### Model Discovery",
                            "**Always check available models before testing:**",
                            "",
                            "- **Image models:** [/image/models](https://gen.pollinations.ai/image/models)",
                            "- **Text models:** [/v1/models](https://gen.pollinations.ai/v1/models)",
                            "",
                            "## Authentication",
                            "",
                            "**Two key types:**",
                            "- **Publishable Keys (`pk_`):** Client-side safe, IP rate-limited (1 pollen/hour per IP+key)",
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
                    // Single tag for all generation endpoints
                    tags: [
                        {
                            name: "gen.pollinations.ai",
                            description:
                                "Generate text, images, and videos using AI models",
                        },
                    ],
                },
            });

            // Call the handler to get the response
            const response = await handler(c, next);
            if (!response) return;

            // Parse the schema, transform paths, and return
            const schema = (await response.json()) as Record<string, unknown>;
            const transformed = transformOpenAPISchema(schema);
            return c.json(transformed);
        });
};
