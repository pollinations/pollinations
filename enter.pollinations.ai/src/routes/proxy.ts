import { type Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { resolver as baseResolver, describeRoute } from "hono-openapi";
import { type AuthVariables, auth } from "@/middleware/auth.ts";
import { type BalanceVariables, balance } from "@/middleware/balance.ts";
import { imageCache } from "@/middleware/image-cache.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { resolveModel } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestDeduplication } from "@/middleware/requestDeduplication.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import type { Env } from "../env.ts";

// Wrapper for resolver that enables schema deduplication via $ref
// Schemas with .meta({ $id: "Name" }) will be extracted to components/schemas
const resolver = <T extends Parameters<typeof baseResolver>[0]>(schema: T) =>
    baseResolver(schema, { reused: "ref" });

import { ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import {
    getAudioModelsInfo,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import { getServiceDefinition } from "@shared/registry/registry.ts";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import { validator } from "@/middleware/validator.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import {
    CreateChatCompletionRequestSchema,
    type CreateChatCompletionResponse,
    CreateChatCompletionResponseSchema,
    type CreateImageEditRequest,
    CreateImageEditRequestSchema,
    type CreateImageRequest,
    CreateImageRequestSchema,
    CreateImageResponseSchema,
    GetModelsResponseSchema,
} from "@/schemas/openai.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { generateMusic, generateSpeech } from "./audio.ts";

const factory = createFactory<Env>();

// Shared handler for OpenAI-compatible chat completions
const chatCompletionHandlers = factory.createHandlers(
    validator("json", CreateChatCompletionRequestSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    async (c) => {
        const log = c.get("log").getChild("generate");
        await c.var.auth.requireAuthorization();
        c.var.auth.requireModelAccess();
        c.var.auth.requireKeyBudget();

        // Use resolved model from middleware for the backend request
        const requestBody = await c.req.json();
        requestBody.model = c.var.model.resolved;
        await checkBalance(c.var);

        const textServiceUrl =
            c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
        const targetUrl = proxyUrl(c, `${textServiceUrl}/openai`);
        const response = await proxy(targetUrl, {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            // Read upstream error and throw UpstreamError to get structured error response
            // This preserves the status code while providing consistent error format
            const responseText = await response.text();
            log.warn("Chat completions error {status}: {body}", {
                status: response.status,
                body: responseText,
            });
            throw new UpstreamError(response.status as ContentfulStatusCode, {
                message:
                    responseText || getDefaultErrorMessage(response.status),
                requestUrl: targetUrl,
            });
        }

        // add content filter headers if not streaming
        let contentFilterHeaders = {};
        if (!c.var.track.streamRequested) {
            const responseJson = await response.clone().json();
            const parsedResponse = CreateChatCompletionResponseSchema.parse(
                responseJson,
                { reportInput: true },
            );
            contentFilterHeaders =
                contentFilterResultsToHeaders(parsedResponse);
        }

        return new Response(response.body, {
            headers: {
                ...Object.fromEntries(response.headers),
                ...contentFilterHeaders,
            },
        });
    },
);

// Helper to filter models by API key permissions
function filterModelsByPermissions<T extends { name: string }>(
    models: T[],
    allowedModels: string[] | undefined,
): T[] {
    if (!allowedModels?.length) return models;
    return models.filter((m) => allowedModels.includes(m.name));
}

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense (10 req/s per IP)
    .use("*", edgeRateLimit)
    // Optional auth for models endpoints - doesn't require auth but uses it if provided
    .use("/v1/models", auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(
        "/image/models",
        auth({ allowApiKey: true, allowSessionCookie: false }),
    )
    .use("/text/models", auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(
        "/audio/models",
        auth({ allowApiKey: true, allowSessionCookie: false }),
    )
    .get(
        "/v1/models",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get available models (OpenAI-compatible). Returns both text and image models. If an API key with model restrictions is provided, only allowed models are returned.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(GetModelsResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const textModels = filterModelsByPermissions(
                getTextModelsInfo(),
                allowedModels,
            );
            const imageModels = filterModelsByPermissions(
                getImageModelsInfo(),
                allowedModels,
            );
            const audioModels = filterModelsByPermissions(
                getAudioModelsInfo(),
                allowedModels,
            );
            const now = Date.now();

            const toModelEntry = (
                m: (typeof textModels)[number],
                supportedEndpoints: string[],
            ) => ({
                id: m.name,
                object: "model" as const,
                created: now,
                input_modalities: m.input_modalities,
                output_modalities: m.output_modalities,
                supported_endpoints: supportedEndpoints,
                ...(m.tools && { tools: m.tools }),
                ...(m.reasoning && { reasoning: m.reasoning }),
                ...(m.context_window && {
                    context_window: m.context_window,
                }),
            });

            return c.json({
                object: "list" as const,
                data: [
                    ...textModels.map((m) =>
                        toModelEntry(m, [
                            "/v1/chat/completions",
                            "/text/{prompt}",
                        ]),
                    ),
                    ...imageModels.map((m) =>
                        toModelEntry(m, [
                            "/v1/images/generations",
                            "/v1/images/edits",
                            "/image/{prompt}",
                        ]),
                    ),
                    ...audioModels.map((m) =>
                        toModelEntry(m, ["/audio/{text}"]),
                    ),
                ],
            });
        },
    )
    .get(
        "/image/models",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get a list of available image generation models with pricing, capabilities, and metadata. If an API key with model restrictions is provided, only allowed models are returned.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            try {
                const allowedModels = c.var.auth?.apiKey?.permissions?.models;
                const models = filterModelsByPermissions(
                    getImageModelsInfo(),
                    allowedModels,
                );
                return c.json(models);
            } catch (error) {
                throw new HTTPException(500, {
                    message: "Failed to load image models",
                    cause: error,
                });
            }
        },
    )
    .get(
        "/text/models",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get a list of available text generation models with pricing, capabilities, and metadata. If an API key with model restrictions is provided, only allowed models are returned.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const models = filterModelsByPermissions(
                getTextModelsInfo(),
                allowedModels,
            );
            return c.json(models);
        },
    )
    .get(
        "/audio/models",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get a list of available audio models with pricing, capabilities, and metadata. If an API key with model restrictions is provided, only allowed models are returned.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const models = filterModelsByPermissions(
                getAudioModelsInfo(),
                allowedModels,
            );
            return c.json(models);
        },
    )
    // Auth required for all endpoints below (API key only - no session cookies)
    .use(auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(frontendKeyRateLimit)
    .use(balance)
    // Request deduplication: prevents duplicate concurrent requests by sharing promises
    .use(requestDeduplication)
    .post(
        "/v1/chat/completions",
        textCache,
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "OpenAI-compatible chat completions endpoint.",
                "",
                "**Legacy endpoint:** `/openai` (deprecated, use `/v1/chat/completions` instead)",
                "",
                "**Authentication (Secret Keys Only):**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
                "Both key types consume Pollen. Secret keys have no rate limits.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CreateChatCompletionResponseSchema,
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        ...chatCompletionHandlers,
    )
    .get(
        "/text/:prompt",
        textCache,
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Generates text from text prompts.",
                "",
                "**Authentication:**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Generated text response",
                    content: {
                        "text/plain": {
                            schema: { type: "string" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description: "Text prompt for generation",
                    example: "Write a haiku about coding",
                }),
            }),
        ),
        validator("query", GenerateTextRequestQueryParamsSchema),
        resolveModel("generate.text"),
        track("generate.text"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            c.var.auth.requireModelAccess();
            c.var.auth.requireKeyBudget();
            await checkBalance(c.var);

            // Use resolved model from middleware
            const model = c.var.model.resolved;

            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
            const prompt = c.req.param("prompt");
            const targetUrl = proxyUrl(
                c,
                `${textServiceUrl}/${encodeURIComponent(prompt)}`,
            );
            // Add model param after proxyUrl() to ensure it's always present
            targetUrl.searchParams.set("model", model);

            const response = await fetch(targetUrl, {
                method: "GET",
                headers: proxyHeaders(c),
            });

            if (!response.ok) {
                // Read upstream error and throw UpstreamError to get structured error response
                // This preserves the status code while providing consistent error format
                const responseText = await response.text();
                log.warn("Text service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            // Backend returns plain text for text models and raw audio for audio models
            // No JSON parsing needed for GET endpoint - just pass through the response
            return response;
        },
    )
    .get(
        // Use :prompt{[\\s\\S]+} regex to capture everything including slashes AND newlines
        // .+ doesn't match newlines, but [\s\S]+ matches any character including \n
        // This creates a named param for OpenAPI docs while matching any characters
        "/image/:prompt{[\\s\\S]+}",
        imageCache,
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Generate an image or video from a text prompt.",
                "",
                "**Image Models:** `flux` (default), `turbo`, `gptimage`, `kontext`, `seedream`, `nanobanana`, `nanobanana-pro`",
                "",
                "**Video Models:** `veo`, `seedance`",
                "- `veo`: Text-to-video only (4-8 seconds)",
                "- `seedance`: Text-to-video and image-to-video (2-10 seconds)",
                "",
                "**Authentication:**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
            responses: {
                200: {
                    description:
                        "Success - Returns the generated image or video",
                    content: {
                        "image/jpeg": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                        "image/png": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                        "video/mp4": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description:
                        "Text description of the image or video to generate",
                    example: "a beautiful sunset over mountains",
                }),
            }),
        ),
        validator("query", GenerateImageRequestQueryParamsSchema),
        resolveModel("generate.image"),
        track("generate.image"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            c.var.auth.requireModelAccess();
            c.var.auth.requireKeyBudget();
            await checkBalance(c.var);

            // Get prompt from validated param (using :prompt{[\\s\\S]+} regex pattern)
            const promptParam = c.req.param("prompt") || "";

            log.debug("Extracted prompt param: {prompt}", {
                prompt: promptParam,
                length: promptParam.length,
            });

            const targetUrl = proxyUrl(c, `${c.env.IMAGE_SERVICE_URL}/prompt`);
            targetUrl.pathname = joinPaths(targetUrl.pathname, promptParam);

            log.debug("Proxying to: {url}", {
                url: targetUrl.toString(),
            });

            const response = await proxy(targetUrl.toString(), {
                method: c.req.method,
                headers: proxyHeaders(c),
                body: c.req.raw.body,
            });

            if (!response.ok) {
                // Read upstream error and throw UpstreamError to get structured error response
                // This preserves the status code while providing consistent error format
                const responseText = await response.text();
                log.warn("Image service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            return response;
        },
    )
    .get(
        "/audio/:text",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Generate audio from text — speech (TTS) or music.",
                "",
                "**Models:** Use `model` query param to select:",
                "- TTS (default): `elevenlabs`, `tts-1`, etc.",
                "- Music: `elevenmusic` (or `music`)",
                "",
                `**TTS Voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                "",
                "**Output Formats (TTS only):** mp3, opus, aac, flac, wav, pcm",
                "",
                "**Music options:** `duration` in seconds (3-300), `instrumental=true`",
                "",
                "**Authentication:**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns audio data",
                    content: {
                        "audio/mpeg": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator(
            "param",
            z.object({
                text: z.string().min(1).meta({
                    description:
                        "Text to convert to speech, or a music description when model=elevenmusic",
                    example: "Hello, welcome to Pollinations!",
                }),
            }),
        ),
        validator(
            "query",
            z.object({
                voice: z
                    .enum(ELEVENLABS_VOICES as unknown as [string, ...string[]])
                    .default("alloy")
                    .meta({
                        description:
                            "Voice to use for speech generation (TTS only)",
                        example: "nova",
                    }),
                response_format: z
                    .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
                    .default("mp3")
                    .meta({
                        description: "Audio output format (TTS only)",
                        example: "mp3",
                    }),
                model: z.string().optional().meta({
                    description:
                        "Audio model: TTS (default) or elevenmusic for music generation",
                    example: "tts-1",
                }),
                duration: z
                    .string()
                    .optional()
                    .transform((v) => (v ? parseFloat(v) : undefined))
                    .meta({
                        description:
                            "Music duration in seconds, 3-300 (elevenmusic only)",
                        example: "30",
                    }),
                instrumental: z
                    .enum(["true", "false"])
                    .default("false")
                    .transform((v) => v === "true")
                    .meta({
                        description:
                            "If true, guarantees instrumental output (elevenmusic only)",
                        example: "false",
                    }),
                key: z.string().optional().meta({
                    description:
                        "API key (alternative to Authorization header)",
                }),
            }),
        ),
        resolveModel("generate.audio"),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            await checkBalance(c.var);

            const text = decodeURIComponent(c.req.param("text"));
            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "elevenmusic") {
                const { duration, instrumental } = c.req.valid(
                    "query" as never,
                ) as {
                    duration?: number;
                    instrumental?: boolean;
                };
                return generateMusic({
                    prompt: text,
                    durationSeconds: duration,
                    forceInstrumental: instrumental,
                    apiKey,
                    log,
                });
            }

            const { voice, response_format } = c.req.valid(
                "query" as never,
            ) as {
                voice: string;
                response_format: string;
            };

            return generateSpeech({
                text,
                voice: voice || "alloy",
                responseFormat: response_format || "mp3",
                apiKey,
                log,
            });
        },
    )
    .post(
        "/v1/images/generations",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "OpenAI-compatible image generation endpoint.",
                "",
                "Generate images from text prompts. Returns a URL to the cached image or base64-encoded data.",
                "",
                "**Authentication:**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(CreateImageResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator("json", CreateImageRequestSchema),
        resolveModel("generate.image"),
        track("generate.image"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            c.var.auth.requireModelAccess();
            c.var.auth.requireKeyBudget();
            await checkBalance(c.var);

            const body = (await c.req.json()) as CreateImageRequest &
                Record<string, unknown>;
            const model = c.var.model.resolved;

            // Parse size string "WIDTHxHEIGHT"
            const [width, height] = (body.size || "1024x1024")
                .split("x")
                .map((s) => parseInt(s, 10));

            // Map OpenAI quality values to Pollinations equivalents
            const qualityMap: Record<string, string> = {
                standard: "medium",
                hd: "high",
            };
            const quality =
                qualityMap[body.quality || ""] || body.quality || "medium";

            // Add seed (use provided or generate random)
            const seed =
                (body.seed as number) ?? Math.floor(Math.random() * 2147483647);

            // Build target URL to image service directly
            const targetUrl = new URL(
                `${c.env.IMAGE_SERVICE_URL}/prompt/${encodeURIComponent(body.prompt)}`,
            );
            targetUrl.searchParams.set("model", model);
            targetUrl.searchParams.set("width", String(width || 1024));
            targetUrl.searchParams.set("height", String(height || 1024));
            targetUrl.searchParams.set("quality", quality);
            targetUrl.searchParams.set("seed", String(seed));
            targetUrl.searchParams.set("nofeed", "true");

            // Forward Pollinations-specific passthrough params
            const passthroughParams = [
                "nologo",
                "enhance",
                "safe",
                "private",
                "transparent",
                "negative_prompt",
                "guidance_scale",
                "image",
            ] as const;
            for (const param of passthroughParams) {
                if (body[param] !== undefined) {
                    targetUrl.searchParams.set(param, String(body[param]));
                }
            }

            log.debug("Proxying image generation to: {url}", {
                url: targetUrl.toString(),
            });

            // Call image service directly (not self-referential)
            const response = await fetch(targetUrl.toString(), {
                method: "GET",
                headers: proxyHeaders(c),
            });

            if (!response.ok) {
                const responseText = await response.text();
                log.warn("Image service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            // Pass raw image response to track middleware for billing
            c.var.track.overrideResponseTracking(response.clone());

            // Always return b64_json (url format not supported)
            const imageBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(imageBuffer);
            let binaryStr = "";
            for (let i = 0; i < bytes.length; i++) {
                binaryStr += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binaryStr);
            return c.json({
                created: Math.floor(Date.now() / 1000),
                data: [
                    {
                        b64_json: base64,
                        revised_prompt: body.prompt,
                    },
                ],
            });
        },
    )
    .post(
        "/v1/images/edits",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "OpenAI-compatible image editing endpoint.",
                "",
                "Edit images using a text prompt and one or more source images.",
                "Accepts JSON with image URLs or multipart/form-data with file uploads.",
                "",
                "**Authentication:**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(CreateImageResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.image"),
        track("generate.image"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            c.var.auth.requireModelAccess();
            c.var.auth.requireKeyBudget();
            await checkBalance(c.var);

            let prompt: string;
            let imageUrls: string[];
            let size: string | undefined;
            let quality: string | undefined;
            let seed: number | undefined;
            const extra: Record<string, unknown> = {};

            const contentType = c.req.header("content-type") || "";

            if (contentType.includes("multipart/form-data")) {
                // Multipart form data (OpenAI SDK default)
                // resolveModel middleware already parsed formData and stored it
                const formData = c.get("formData") || (await c.req.formData());
                prompt = formData.get("prompt") as string;
                if (!prompt) {
                    throw new UpstreamError(400 as ContentfulStatusCode, {
                        message: "Missing required field: prompt",
                    });
                }

                size = (formData.get("size") as string) || undefined;
                quality = (formData.get("quality") as string) || undefined;

                // Extract image(s) from form data — convert file uploads to data URIs
                imageUrls = [];
                const imageEntries = formData.getAll("image") as (
                    | File
                    | string
                )[];
                // Also check image[] (array syntax used by OpenAI SDKs)
                const imageArrayEntries = formData.getAll("image[]") as (
                    | File
                    | string
                )[];
                const allImages = [...imageEntries, ...imageArrayEntries];

                for (const entry of allImages) {
                    if (typeof entry === "string") {
                        imageUrls.push(entry);
                    } else if (entry instanceof File) {
                        const buffer = await entry.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        let binaryStr = "";
                        for (let i = 0; i < bytes.length; i++) {
                            binaryStr += String.fromCharCode(bytes[i]);
                        }
                        const base64 = btoa(binaryStr);
                        const mime = entry.type || "image/png";
                        imageUrls.push(`data:${mime};base64,${base64}`);
                    }
                }
            } else {
                // JSON body
                const body = (await c.req.json()) as CreateImageEditRequest &
                    Record<string, unknown>;
                const parsed = CreateImageEditRequestSchema.safeParse(body);
                if (!parsed.success) {
                    throw new UpstreamError(400 as ContentfulStatusCode, {
                        message: parsed.error.issues
                            .map((i) => i.message)
                            .join(", "),
                    });
                }

                prompt = parsed.data.prompt;
                size = parsed.data.size;
                quality = parsed.data.quality;

                // Normalize image field to URL array
                if (typeof parsed.data.image === "string") {
                    imageUrls = [parsed.data.image];
                } else {
                    imageUrls = parsed.data.image.map((i) => i.image_url);
                }

                // Collect passthrough params
                for (const key of [
                    "seed",
                    "nologo",
                    "enhance",
                    "safe",
                    "private",
                    "transparent",
                    "negative_prompt",
                    "guidance_scale",
                ] as const) {
                    if (body[key] !== undefined) extra[key] = body[key];
                }
                seed = extra.seed as number | undefined;
            }

            if (imageUrls.length === 0) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required field: image",
                });
            }

            const resolvedModel = c.var.model.resolved;

            // Parse size
            const [width, height] = (size || "1024x1024")
                .split("x")
                .map((s) => parseInt(s, 10));

            // Map quality
            const qualityMap: Record<string, string> = {
                standard: "medium",
                hd: "high",
            };
            const resolvedQuality =
                qualityMap[quality || ""] || quality || "medium";

            const resolvedSeed =
                seed ?? Math.floor(Math.random() * 2147483647);

            // Build target URL — same backend, with image param
            const targetUrl = new URL(
                `${c.env.IMAGE_SERVICE_URL}/prompt/${encodeURIComponent(prompt)}`,
            );
            targetUrl.searchParams.set("model", resolvedModel);
            targetUrl.searchParams.set("width", String(width || 1024));
            targetUrl.searchParams.set("height", String(height || 1024));
            targetUrl.searchParams.set("quality", resolvedQuality);
            targetUrl.searchParams.set("seed", String(resolvedSeed));
            targetUrl.searchParams.set("nofeed", "true");
            // Pass image URLs pipe-separated (backend format)
            targetUrl.searchParams.set("image", imageUrls.join("|"));

            // Forward extra passthrough params
            for (const [key, value] of Object.entries(extra)) {
                if (key !== "seed" && value !== undefined) {
                    targetUrl.searchParams.set(key, String(value));
                }
            }

            log.debug("Proxying image edit to: {url}", {
                url: targetUrl.toString(),
            });

            const response = await fetch(targetUrl.toString(), {
                method: "GET",
                headers: proxyHeaders(c),
            });

            if (!response.ok) {
                const responseText = await response.text();
                log.warn("Image service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            c.var.track.overrideResponseTracking(response.clone());

            const imageBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(imageBuffer);
            let binaryStr = "";
            for (let i = 0; i < bytes.length; i++) {
                binaryStr += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binaryStr);
            return c.json({
                created: Math.floor(Date.now() / 1000),
                data: [
                    {
                        b64_json: base64,
                        revised_prompt: prompt,
                    },
                ],
            });
        },
    );

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    const userApiKey = c.var.auth?.apiKey?.rawKey || "";

    // Copy headers excluding Authorization
    const headers = { ...c.req.header() };
    delete headers.authorization;
    delete headers.Authorization;

    return {
        ...headers,
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
        "x-enter-token": c.env.PLN_ENTER_TOKEN,
        "x-user-api-key": userApiKey, // For community model billing passthrough
    };
}

function proxyUrl(c: Context, targetBaseUrl: string, targetPort = ""): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);

    if (targetPort) {
        targetUrl.port = targetPort;
    }

    // Copy query parameters excluding 'key' (auth only)
    const searchParams = new URLSearchParams(incomingUrl.search);
    searchParams.delete("key");

    // Replace model with resolved model (handles aliases)
    if (c.var.model?.resolved && searchParams.has("model")) {
        searchParams.set("model", c.var.model.resolved);
    }

    targetUrl.search = searchParams.toString();
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function contentFilterResultsToHeaders(
    response: CreateChatCompletionResponse,
): Record<string, string> {
    const promptFilters =
        response.prompt_filter_results?.[0]?.content_filter_results;
    const completionFilters = response.choices?.[0]?.content_filter_results;

    const mapToString = (value: unknown): string | undefined =>
        value ? String(value) : undefined;

    // Build header mappings
    const headerMappings: Array<[string, unknown]> = [
        // Prompt filters
        ["x-moderation-prompt-hate-severity", promptFilters?.hate?.severity],
        [
            "x-moderation-prompt-self-harm-severity",
            promptFilters?.self_harm?.severity,
        ],
        [
            "x-moderation-prompt-sexual-severity",
            promptFilters?.sexual?.severity,
        ],
        [
            "x-moderation-prompt-violence-severity",
            promptFilters?.violence?.severity,
        ],
        [
            "x-moderation-prompt-jailbreak-detected",
            promptFilters?.jailbreak?.detected,
        ],
        // Completion filters
        [
            "x-moderation-completion-hate-severity",
            completionFilters?.hate?.severity,
        ],
        [
            "x-moderation-completion-self-harm-severity",
            completionFilters?.self_harm?.severity,
        ],
        [
            "x-moderation-completion-sexual-severity",
            completionFilters?.sexual?.severity,
        ],
        [
            "x-moderation-completion-violence-severity",
            completionFilters?.violence?.severity,
        ],
        [
            "x-moderation-completion-protected-material-text-detected",
            completionFilters?.protected_material_text?.detected,
        ],
        [
            "x-moderation-completion-protected-material-code-detected",
            completionFilters?.protected_material_code?.detected,
        ],
    ];

    // Convert to headers, filtering out undefined values
    const headers: Record<string, string> = {};
    for (const [key, value] of headerMappings) {
        const stringValue = mapToString(value);
        if (stringValue !== undefined) {
            headers[key] = stringValue;
        }
    }

    return headers;
}

async function checkBalance({
    auth,
    balance,
    model,
}: AuthVariables & BalanceVariables & ModelVariables): Promise<void> {
    if (!auth.user?.id) return;

    const serviceDefinition = getServiceDefinition(model.resolved);
    const isPaidOnly = serviceDefinition.paidOnly ?? false;

    if (isPaidOnly) {
        await balance.requirePaidBalance(
            auth.user.id,
            "This model requires a paid balance. Tier balance cannot be used.",
        );
    } else {
        await balance.requirePositiveBalance(
            auth.user.id,
            "Insufficient pollen balance to use this model",
        );
    }
}
