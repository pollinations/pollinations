import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";

// BYOP documentation - imported at build time
const BYOP_DOCS = `
## Bring Your Own Pollen (BYOP) 🌸

Users pay for their own AI usage. You pay $0. Ship apps without API costs ✨

### The Flow

1. User taps "Connect with Pollinations"
2. They sign in → get a temp API key
3. Their pollen, your app

### Why BYOP?

- **$0 costs** — 1 user or 1000, same price: free
- **No key drama** — auth flow handles it
- **Self-regulating** — everyone pays for their own usage
- **Frontend only** — no backend needed

### URLs

Say your app is at \`https://myapp.com\`

**You redirect user to:**
\`\`\`
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
\`\`\`

**We redirect back with key:**
\`\`\`
https://myapp.com#api_key=sk_abc123xyz
\`\`\`

> [!tip]
> Key is in the \`#\` fragment so it never hits server logs 🔒

### Code

\`\`\`javascript
// 1. Send user to auth
window.location.href = \`https://enter.pollinations.ai/authorize?redirect_url=\${encodeURIComponent(location.href)}\`;

// 2. Grab key from URL after redirect
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');

// 3. Use their pollen
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': \`Bearer \${apiKey}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
\`\`\`

Keys expire in 30 days · revoke anytime from dashboard
`;

// Get all model aliases (values we want to hide from docs)
const IMAGE_ALIASES: Set<string> = new Set(
    Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
);
const TEXT_ALIASES: Set<string> = new Set(
    Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
);
const ALL_ALIASES: Set<string> = new Set([...IMAGE_ALIASES, ...TEXT_ALIASES]);

// Filter model aliases from enum arrays in schema
function filterAliases(
    schema: Record<string, unknown>,
): Record<string, unknown> {
    return JSON.parse(
        JSON.stringify(schema, (key, value) => {
            if (key === "enum" && Array.isArray(value)) {
                const filtered = value.filter((v) => !ALL_ALIASES.has(v));
                return filtered.length !== value.length ? filtered : value;
            }
            return value;
        }),
    );
}

// Transform OpenAPI schema for gen.pollinations.ai:
// 1. Remove /generate/ prefix from paths
// 2. Filter out model aliases from enums (show only primary model names)
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

    // Filter aliases from the entire schema
    return filterAliases({
        ...schema,
        paths: newPaths,
    });
}

export const createDocsRoutes = (apiRouter: Hono<Env>) => {
    return new Hono<Env>()
        .get("/", (c, next) =>
            Scalar<Env>({
                pageTitle: "pollinations.ai API Reference",
                title: "pollinations.ai API Reference",
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
                        title: "pollinations.ai API",
                        version: "0.3.0",
                        description: [
                            "Documentation for `gen.pollinations.ai` - the pollinations.ai API gateway.",
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
                            "**Gemini Tools:** `gemini`, `gemini-large` have `code_execution` enabled (can generate images/plots). `gemini-search` has `google_search` enabled. Responses may include `content_blocks` with `image_url`, `text`, or `thinking` types.",
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
                            "",
                            BYOP_DOCS,
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
