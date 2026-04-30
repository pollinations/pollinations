import { Scalar } from "@scalar/hono-api-reference";
import { AUDIO_SERVICES, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import type { Env } from "@/env.ts";
import BYOP_MD from "../../../BRING_YOUR_OWN_POLLEN.md?raw";

type OpenApiSchema = Record<string, unknown>;

const BYOP_DOCS = BYOP_MD.trim();

const IMAGE_ALIASES = new Set(
    Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
);
const TEXT_ALIASES = new Set(
    Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
);
const AUDIO_ALIASES = new Set(
    Object.values(AUDIO_SERVICES).flatMap((service) => service.aliases),
);
const ALL_ALIASES = new Set([
    ...IMAGE_ALIASES,
    ...TEXT_ALIASES,
    ...AUDIO_ALIASES,
]);

const imageModelDisplayNames = Object.keys(IMAGE_SERVICES)
    .filter(
        (id) =>
            !(
                IMAGE_SERVICES[id as keyof typeof IMAGE_SERVICES]
                    .outputModalities as string[] | undefined
            )?.includes("video"),
    )
    .join(", ");

const videoModelDisplayNames = Object.keys(IMAGE_SERVICES)
    .filter((id) =>
        (
            IMAGE_SERVICES[id as keyof typeof IMAGE_SERVICES]
                .outputModalities as string[] | undefined
        )?.includes("video"),
    )
    .join(", ");

const textModelDisplayNames = Object.keys(TEXT_SERVICES).join(", ");
const audioModelDisplayNames = Object.keys(AUDIO_SERVICES).join(", ");

function filterAliases(schema: OpenApiSchema): OpenApiSchema {
    return JSON.parse(
        JSON.stringify(schema, (key, value) => {
            if (key === "enum" && Array.isArray(value)) {
                const filtered = value.filter(
                    (v) => typeof v !== "string" || !ALL_ALIASES.has(v),
                );
                return filtered.length !== value.length ? filtered : value;
            }
            return value;
        }),
    ) as OpenApiSchema;
}

function generateLLMDoc(): string {
    return [
        "# Pollinations API",
        "",
        "> Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.",
        "",
        "Base URL: https://gen.pollinations.ai",
        "API Keys: https://enter.pollinations.ai",
        "Docs: https://gen.pollinations.ai/docs",
        "OpenAPI: https://gen.pollinations.ai/docs/open-api/generate-schema",
        "CLI: `npx @pollinations_ai/cli` (binary: `polli`) — agent-friendly, `--json` everywhere",
        "",
        "## Quick Start",
        "",
        "### Text (Python, OpenAI SDK)",
        "",
        "```python",
        "from openai import OpenAI",
        'client = OpenAI(base_url="https://gen.pollinations.ai", api_key="YOUR_API_KEY")',
        'response = client.chat.completions.create(model="openai", messages=[{"role": "user", "content": "Hello!"}])',
        "print(response.choices[0].message.content)",
        "```",
        "",
        "### Image (URL — no code needed)",
        "",
        "```",
        "https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux",
        "```",
        "",
        "### Audio (cURL)",
        "",
        "```bash",
        'curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\',
        '  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3',
        "```",
        "",
        "## Authentication",
        "",
        "All generation requests require an API key. Model listing endpoints work without auth.",
        "",
        "- Header: `Authorization: Bearer YOUR_API_KEY`",
        "- Query param: `?key=YOUR_API_KEY`",
        "",
        "Key types: `sk_` (secret, server-side) | `pk_` (publishable, client-side, rate limited)",
        "",
        "## Generation",
        "",
        "- POST /v1/chat/completions: OpenAI-compatible text generation.",
        "- POST /text: text generation with direct content response.",
        "- GET /text/{prompt}: simple text generation.",
        "- GET /image/{prompt}: image generation.",
        "- GET /video/{prompt}: video generation.",
        "- GET /audio/{text}: speech or music generation.",
        "- POST /v1/audio/speech: OpenAI-compatible speech generation.",
        "- POST /v1/audio/transcriptions: audio transcription.",
        "- POST /v1/images/generations: OpenAI-compatible image generation.",
        "- POST /v1/images/edits: OpenAI-compatible image editing.",
        "",
        "## Models",
        "",
        "- GET /v1/models",
        "- GET /text/models",
        "- GET /image/models",
        "- GET /audio/models",
        "",
        "## Account",
        "",
        "All account endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission.",
        "Base path: /account",
        "",
        "### GET /account/profile",
        "",
        "Returns user profile. `githubUsername`, `image`, `tier`, and `nextResetAt` are always included. `name` and `email` are included only when the API key has the `account:profile` permission.",
        "",
        "### GET /account/balance",
        "",
        "Returns remaining pollen. If the API key has a budget, returns key budget instead.",
        "",
        "### GET /account/usage",
        "",
        "Per-request usage history: model, token counts, cost, response time.",
        "",
        "## Media Storage",
        "",
        "Base URL: https://media.pollinations.ai",
        "Content-addressed file storage. Upload requires API key; retrieval is public.",
        "",
        "## Errors",
        "",
        "JSON: {status, success: false, error: {code, message}}",
        "- 400: Invalid parameters",
        "- 401: Missing/invalid API key",
        "- 402: Insufficient balance",
        "- 403: Permission denied",
        "- 500: Server error",
        "",
        BYOP_DOCS,
    ].join("\n");
}

const LLM_DOC_TEXT = generateLLMDoc();

const LLM_BUTTON_HTML = `
<script>
(function () {
  var button = document.createElement('button');
  button.textContent = 'Copy for LLMs';
  button.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#111827;font:14px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.14);cursor:pointer';
  button.onclick = async function () {
    var res = await fetch('/docs/llm.txt');
    var text = await res.text();
    await navigator.clipboard.writeText(text);
    var previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(function () { button.textContent = previous; }, 1200);
  };
  document.body.appendChild(button);
})();
</script>`;

function generationDocumentation(): OpenApiSchema {
    return {
        servers: [{ url: "https://gen.pollinations.ai" }],
        info: {
            title: "Pollinations API",
            version: "0.3.0",
            description: [
                "## Introduction",
                "",
                "Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.",
                "",
                "**Base URL:** `https://gen.pollinations.ai`",
                "",
                "**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai)",
                "",
                "## Overview",
                "",
                "| Capability | Endpoint | Format |",
                "|---|---|---|",
                "| ✍️ **Text Generation** | `POST /v1/chat/completions` | OpenAI-compatible |",
                "| ✍️ **Simple Text** | `GET /text/{prompt}` | Plain text |",
                "| 🖼️ **Image Generation** | `GET /image/{prompt}` | JPEG / PNG |",
                "| 🎬 **Video Generation** | `GET /video/{prompt}` | MP4 |",
                "| 🔊 **Text-to-Speech** | `GET /audio/{text}` | MP3 |",
                "| 🔊 **Music Generation** | `GET /audio/{text}` | MP3 |",
                "| 🔊 **Transcription** | `POST /v1/audio/transcriptions` | JSON |",
                "| 🤖 **Model Discovery** | `GET /v1/models` | JSON |",
                "",
                "## Quick Start",
                "",
                "### Generate an Image",
                "",
                "Paste this URL in your browser — no code needed:",
                "",
                "```",
                "https://gen.pollinations.ai/image/a%20cat%20in%20space",
                "```",
                "",
                "Or use it directly in HTML:",
                "",
                "```html",
                '<img src="https://gen.pollinations.ai/image/a%20cat%20in%20space" />',
                "```",
                "",
                "### Generate Text (OpenAI-compatible)",
                "",
                "```bash",
                "curl https://gen.pollinations.ai/v1/chat/completions \\",
                '  -H "Authorization: Bearer YOUR_API_KEY" \\',
                '  -H "Content-Type: application/json" \\',
                '  -d \'{"model": "openai", "messages": [{"role": "user", "content": "Hello!"}]}\'',
                "```",
                "",
                "### Generate Speech",
                "",
                "```bash",
                'curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\',
                '  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3',
                "```",
                "",
                "## 🖥️ CLI",
                "",
                "`@pollinations_ai/cli` wraps this API for terminals and agents. Structured `--json` output, deterministic exit codes, friendly 402 balance hints, stdin piping.",
                "",
                "```bash",
                "npm install -g @pollinations_ai/cli",
                "polli auth login",
                'polli gen image "a cat in space" --model flux --output cat.png',
                'polli gen text "summarize this" < notes.md',
                "polli models --type image",
                "```",
                "",
                "Source: [github.com/pollinations/pollinations/tree/main/packages/polli-cli](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)",
                "",
                "## 🔐 Authentication",
                "",
                "All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.",
                "",
                "**Two key types:**",
                "",
                "| Type | Prefix | Use case | Rate limits |",
                "|------|--------|----------|-------------|",
                "| Secret | `sk_` | Server-side apps | None |",
                "| Publishable | `pk_` | Client-side apps (beta) | 1 pollen/IP/hour |",
                "",
                "**How to authenticate:**",
                "",
                "```bash",
                "# Option 1: Authorization header (recommended)",
                'curl -H "Authorization: Bearer YOUR_API_KEY" ...',
                "",
                "# Option 2: Query parameter",
                'curl "https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY"',
                "```",
                "",
                "> **Warning:** Never expose secret keys (`sk_`) in client-side code. Use publishable keys (`pk_`) for frontend apps.",
                "",
                "## ❌ Errors",
                "",
                "All errors return JSON with a consistent format:",
                "",
                "```json",
                "{",
                '  "status": 400,',
                '  "success": false,',
                '  "error": {',
                '    "code": "BAD_REQUEST",',
                '    "message": "Description of what went wrong"',
                "  }",
                "}",
                "```",
                "",
                "| Status | Meaning |",
                "|--------|---------|",
                "| `400` | Invalid parameters or malformed request |",
                "| `401` | Missing or invalid API key |",
                "| `402` | Insufficient pollen balance |",
                "| `403` | API key lacks required permission |",
                "| `500` | Internal server error |",
            ].join("\n"),
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "API Key",
                    description:
                        "API key from [enter.pollinations.ai](https://enter.pollinations.ai)",
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            {
                name: "✍️ Text Generation",
                description: [
                    "Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by changing the base URL.",
                    "",
                    "| Endpoint | Best for |",
                    "|----------|----------|",
                    "| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |",
                    "| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |",
                    "",
                    `**Available models:** ${textModelDisplayNames}`,
                ].join("\n"),
            },
            {
                name: "🖼️ Image Generation",
                description: [
                    "Generate images from text prompts via a simple GET request. Returns JPEG or PNG.",
                    "",
                    "```",
                    "https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux",
                    "```",
                    "",
                    `**Available models:** ${imageModelDisplayNames}`,
                ].join("\n"),
            },
            {
                name: "🎬 Video Generation",
                description: [
                    "Generate videos from text prompts or reference images. Returns MP4.",
                    "",
                    "```",
                    "https://gen.pollinations.ai/video/sunset%20timelapse?model=veo&duration=4",
                    "```",
                    "",
                    `**Available models:** ${videoModelDisplayNames}`,
                ].join("\n"),
            },
            {
                name: "🔊 Audio Generation",
                description: [
                    "Text-to-speech, music generation, and audio transcription.",
                    "",
                    "| Endpoint | Description |",
                    "|----------|-------------|",
                    "| `GET /audio/{text}` | Simple URL-based TTS or music generation |",
                    "| `POST /v1/audio/speech` | OpenAI-compatible TTS |",
                    "| `POST /v1/audio/transcriptions` | Speech-to-text transcription |",
                    "",
                    `**Audio models:** ${audioModelDisplayNames}`,
                    "",
                    `**Available voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                ].join("\n"),
            },
            {
                name: "🤖 Models",
                description: [
                    "Discover available models with pricing, capabilities, and metadata. No authentication required.",
                    "",
                    "| Endpoint | Returns |",
                    "|----------|---------|",
                    '| `GET /v1/models` | Text models in OpenAI format (`{object: "list", data: [...]}`) |',
                    "| `GET /text/models` | Text models with pricing, context window, tool support |",
                    "| `GET /image/models` | Image & video models with capabilities and pricing |",
                    "| `GET /audio/models` | Audio models with supported voices |",
                ].join("\n"),
            },
            {
                name: "👤 Account",
                description: [
                    "Manage your account, check your pollen balance, and view usage history. All endpoints require authentication.",
                    "",
                    "| Endpoint | Description |",
                    "|----------|-------------|",
                    "| `GET /account/profile` | GitHub username and profile image |",
                    "| `GET /account/balance` | Current pollen balance |",
                    "| `GET /account/usage` | Per-request history with costs |",
                    "| `GET /account/usage/daily` | Daily aggregated usage for dashboards |",
                    "| `GET /account/key` | API key validity, type, and permissions |",
                    "",
                    "When using API keys, specific permissions may be required, such as `account:usage` or `account:profile`.",
                ].join("\n"),
            },
            {
                name: "📦 Media Storage",
                description: [
                    "Content-addressed media storage. Upload and retrieve images, audio, and video by content hash.",
                    "",
                    "| Endpoint | Description |",
                    "|----------|-------------|",
                    "| `POST /upload` | Upload a file, receive a content-addressed URL |",
                    "| `GET /{hash}` | Retrieve a previously uploaded file |",
                    "| `GET /{hash}/metadata` | Get file metadata as JSON |",
                    "",
                    "**Base URL:** https://media.pollinations.ai",
                ].join("\n"),
            },
            {
                name: "🌸 Bring Your Own Pollen",
                description: BYOP_DOCS,
            },
        ],
    };
}

let generationSchemaPromise: Promise<OpenApiSchema> | undefined;

function getGenerationSchema(genApp: Hono<Env>): Promise<OpenApiSchema> {
    generationSchemaPromise ??= generateSpecs(genApp, {
        documentation: generationDocumentation(),
    }).then((schema) => transformGenerationSchema(schema as OpenApiSchema));
    return generationSchemaPromise;
}

function transformGenerationSchema(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        const publicPath = path.replace(/^\/api\/account(?=\/|$)/, "/account");
        paths[publicPath] = value;
    }

    return filterAliases({
        ...schema,
        paths,
    });
}

async function fetchEnterSchema(c: Context<Env>) {
    const url = new URL(c.req.url);
    url.pathname = "/api/docs/open-api/generate-schema";
    const response = await c.env.ENTER.fetch(
        new Request(url, {
            method: "GET",
            headers: c.req.raw.headers,
        }),
    );
    if (!response.ok) return undefined;

    const schema = (await response.json()) as OpenApiSchema;
    return transformEnterSchema(stripGenerationPaths(schema));
}

async function fetchMediaSchema(): Promise<OpenApiSchema | undefined> {
    const response = await fetch("https://media.pollinations.ai/openapi.json");
    if (!response.ok) return undefined;
    const schema = (await response.json()) as OpenApiSchema;

    for (const operations of Object.values(asRecord(schema.paths))) {
        if (!operations || typeof operations !== "object") continue;
        (operations as OpenApiSchema).servers = [
            { url: "https://media.pollinations.ai" },
        ];
        for (const operation of Object.values(operations as OpenApiSchema)) {
            if (!operation || typeof operation !== "object") continue;
            const record = operation as { tags?: unknown };
            if (!Array.isArray(record.tags)) continue;
            record.tags = record.tags.map((tag) =>
                tag === "media.pollinations.ai" ? "📦 Media Storage" : tag,
            );
        }
    }

    return schema;
}

function transformEnterSchema(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        if (!isPublicAccountPath(path)) continue;
        const publicPath = path.replace(/^\/api\/account(?=\/|$)/, "/account");
        paths[publicPath] = value;
    }
    return { ...schema, tags: tagsForPaths(schema, paths), paths };
}

function isPublicAccountPath(path: string): boolean {
    return (
        path === "/account" ||
        path.startsWith("/account/") ||
        path === "/api/account" ||
        path.startsWith("/api/account/")
    );
}

function tagsForPaths(
    schema: OpenApiSchema,
    paths: OpenApiSchema,
): OpenApiSchema[] {
    const usedTags = new Set<string>();
    for (const pathItem of Object.values(paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const operation of Object.values(pathItem as OpenApiSchema)) {
            if (!operation || typeof operation !== "object") continue;
            const tags = (operation as { tags?: unknown }).tags;
            if (!Array.isArray(tags)) continue;
            for (const tag of tags) {
                if (typeof tag === "string") usedTags.add(tag);
            }
        }
    }

    return asRecordArray(schema.tags).filter(
        (tag) => typeof tag.name === "string" && usedTags.has(tag.name),
    );
}

function stripGenerationPaths(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        if (!isGenerationPath(path)) {
            paths[path] = value;
        }
    }
    return { ...schema, paths };
}

function isGenerationPath(path: string): boolean {
    return (
        path === "/models" ||
        path === "/v1" ||
        path.startsWith("/v1/") ||
        path === "/image" ||
        path.startsWith("/image/") ||
        path === "/text" ||
        path.startsWith("/text/") ||
        path === "/audio" ||
        path.startsWith("/audio/") ||
        path === "/video" ||
        path.startsWith("/video/") ||
        path === "/generate" ||
        path.startsWith("/generate/")
    );
}

function mergeSchemas(
    generationSchema: OpenApiSchema,
    enterSchema?: OpenApiSchema,
    mediaSchema?: OpenApiSchema,
): OpenApiSchema {
    const merged = filterAliases({
        ...(enterSchema ?? {}),
        ...generationSchema,
        info: generationSchema.info,
        servers: generationSchema.servers,
        security: generationSchema.security,
        tags: mergeTags(
            asRecordArray(generationSchema.tags),
            asRecordArray(enterSchema?.tags),
        ),
        components: mergeComponents(
            asRecord(enterSchema?.components),
            asRecord(generationSchema.components),
        ),
        paths: {
            ...asRecord(enterSchema?.paths),
            ...asRecord(generationSchema.paths),
        },
    });

    if (!mediaSchema) return merged;

    return filterAliases({
        ...merged,
        components: mergeComponents(
            asRecord(merged.components),
            asRecord(mediaSchema.components),
        ),
        paths: {
            ...asRecord(merged.paths),
            ...asRecord(mediaSchema.paths),
        },
    });
}

function mergeTags(primary: OpenApiSchema[], secondary: OpenApiSchema[]) {
    const tags = new Map<string, OpenApiSchema>();
    for (const tag of [...primary, ...secondary]) {
        if (typeof tag.name === "string" && !tags.has(tag.name)) {
            tags.set(tag.name, tag);
        }
    }
    return [...tags.values()];
}

function mergeComponents(base: OpenApiSchema, overrides: OpenApiSchema) {
    const merged: OpenApiSchema = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        const baseValue = merged[key];
        if (
            baseValue &&
            value &&
            typeof baseValue === "object" &&
            typeof value === "object" &&
            !Array.isArray(baseValue) &&
            !Array.isArray(value)
        ) {
            merged[key] = { ...baseValue, ...value };
        } else {
            merged[key] = value;
        }
    }
    return merged;
}

function asRecord(value: unknown): OpenApiSchema {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as OpenApiSchema;
}

function asRecordArray(value: unknown): OpenApiSchema[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item): item is OpenApiSchema =>
            !!item && typeof item === "object" && !Array.isArray(item),
    );
}

export function createDocsRoutes(genApp: Hono<Env>): Hono<Env> {
    return new Hono<Env>()
        .get("/", async (c, next) => {
            const response = await Scalar<Env>({
                pageTitle: "Pollinations API Reference",
                title: "Pollinations API Reference",
                theme: "saturn",
                hideModels: true,
                sources: [
                    { url: "/docs/open-api/generate-schema", title: "API" },
                ],
                authentication: {
                    preferredSecurityScheme: "bearerAuth",
                    securitySchemes: {
                        bearerAuth: {
                            token: "",
                        },
                    },
                },
            })(c, next);
            if (!response) return;
            const html = await response.text();
            const lastBodyIdx = html.lastIndexOf("</body>");
            if (lastBodyIdx === -1) return c.html(html);
            return c.html(
                html.slice(0, lastBodyIdx) +
                    LLM_BUTTON_HTML +
                    html.slice(lastBodyIdx),
            );
        })
        .get("/llm.txt", (c) => {
            c.header("Cache-Control", "public, max-age=3600");
            return c.text(LLM_DOC_TEXT);
        })
        .get("/open-api/generate-schema", async (c) => {
            const [generationSchema, enterSchema, mediaSchema] =
                await Promise.all([
                    getGenerationSchema(genApp),
                    fetchEnterSchema(c).catch(() => undefined),
                    fetchMediaSchema().catch(() => undefined),
                ]);

            return c.json(
                mergeSchemas(generationSchema, enterSchema, mediaSchema),
            );
        });
}
