import { Scalar } from "@scalar/hono-api-reference";
import { AUDIO_SERVICES, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import type { Env } from "@/env.ts";

type OpenApiSchema = Record<string, unknown>;

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
        "Base URL: https://gen.pollinations.ai",
        "API Keys: https://enter.pollinations.ai",
        "OpenAPI: https://gen.pollinations.ai/docs/open-api/generate-schema",
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
        "## Account API",
        "",
        "Account and API-key routes are available through gen at /account/*.",
        "",
        "## Authentication",
        "",
        "Use Authorization: Bearer YOUR_API_KEY. The ?key= query parameter is also accepted for simple GET endpoints.",
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
                "Generate text, images, video, and audio with a single API.",
                "",
                "**Base URL:** `https://gen.pollinations.ai`",
                "",
                "**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai)",
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
                description: `Text models: ${textModelDisplayNames}`,
            },
            {
                name: "🖼️ Image Generation",
                description: `Image models: ${imageModelDisplayNames}`,
            },
            {
                name: "🎬 Video Generation",
                description: `Video models: ${videoModelDisplayNames}`,
            },
            {
                name: "🔊 Audio Generation",
                description: `Audio models: ${audioModelDisplayNames}. Voices: ${ELEVENLABS_VOICES.join(", ")}`,
            },
            {
                name: "🤖 Models",
                description:
                    "Discover available models with pricing, capabilities, and metadata.",
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
    return stripGenerationPaths(schema);
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
): OpenApiSchema {
    if (!enterSchema) return generationSchema;

    return filterAliases({
        ...enterSchema,
        ...generationSchema,
        info: generationSchema.info,
        servers: generationSchema.servers,
        security: generationSchema.security,
        tags: mergeTags(
            asRecordArray(generationSchema.tags),
            asRecordArray(enterSchema.tags),
        ),
        components: mergeComponents(
            asRecord(enterSchema.components),
            asRecord(generationSchema.components),
        ),
        paths: {
            ...asRecord(enterSchema.paths),
            ...asRecord(generationSchema.paths),
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
            const [generationSchema, enterSchema] = await Promise.all([
                getGenerationSchema(genApp),
                fetchEnterSchema(c).catch(() => undefined),
            ]);

            return c.json(mergeSchemas(generationSchema, enterSchema));
        });
}
